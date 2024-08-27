import cv2
import numpy as np
from dbr import *
import multiprocessing
import time
import logging
import json
import argparse
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from typing import List, Tuple, Dict
from logging.handlers import RotatingFileHandler
import queue

class LiveBarcodeProcessor:
    def __init__(self, hls_url: str, num_processes: int = None, batch_size: int = 10):
        self.hls_url = hls_url
        self.num_processes = num_processes or max(1, multiprocessing.cpu_count() - 1)
        self.batch_size = batch_size
        self.setup_logging()
        self.setup_barcode_reader()
        self.current_phase = "Initializing"
        self.result_queue = multiprocessing.Queue()
        self.frame_queue = multiprocessing.Queue(maxsize=100)  # Limit queue size

    def setup_logging(self):
        self.logger = logging.getLogger(__name__)
        self.logger.setLevel(logging.INFO)
        handler = RotatingFileHandler(
            'barcode_processing.log', maxBytes=10*1024*1024, backupCount=5)
        formatter = logging.Formatter(
            '%(asctime)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)

    def setup_barcode_reader(self):
        try:
            self.current_phase = "Setting up Barcode Reader"
            error = BarcodeReader.init_license(
                "t0068lQAAAA2pXZHpqRByl86hW7xQuBmwOuRyX0SYdXPBcLb2Ypdnhj8deMjXwQrx35i7iJ/1bME6aNvB5Tjetr5gxIDG7oU=;t0070lQAAAIPaciZu/aZgf3PIz0x6Py7oKoQq4nZ6BO9nQshqyF3khp/hfz6E+1upqLRZcb5KS2L42LaNWcVC53/NbCLVyB0hgA==")
            if error[0] != EnumErrorCode.DBR_OK:
                raise BarcodeReaderError(f"License error: {error[1]}")
        except BarcodeReaderError as bre:
            self.logger.error(f"Barcode Reader Error: {str(bre)}")
            raise

    def process_frame(self, frame: np.ndarray, dbr: BarcodeReader) -> List[Tuple[str, List[Tuple[int, int]]]]:
        try:
            results = dbr.decode_buffer(frame)
            if results is None:
                return []
            return [(result.barcode_text, result.localization_result.localization_points) for result in results]
        except BarcodeReaderError as bre:
            self.logger.error(f"Error processing frame: {str(bre)}")
            return []

    def process_frames(self, frames: List[np.ndarray], result_queue: multiprocessing.Queue):
        dbr = BarcodeReader()
        with ThreadPoolExecutor(max_workers=self.batch_size) as executor:
            futures = [executor.submit(self.process_frame, frame, dbr) for frame in frames]
            for future in futures:
                try:
                    barcodes = future.result(timeout=10)
                    result_queue.put(barcodes)
                except TimeoutError:
                    self.logger.error(f"Timeout processing frame")
                except Exception as e:
                    self.logger.error(f"Error processing frame: {str(e)}")
        dbr.recycle_instance()

    def frame_reader(self, frame_queue: multiprocessing.Queue):
        cap = cv2.VideoCapture(self.hls_url)
        if not cap.isOpened():
            self.logger.error("Error opening HLS stream")
            return

        while True:
            ret, frame = cap.read()
            if not ret:
                self.logger.warning("Failed to read frame from stream")
                time.sleep(0.1)  # Short delay before trying again
                continue

            if frame_queue.full():
                frame_queue.get()  # Remove oldest frame if queue is full
            frame_queue.put(frame)

    def process_live_stream(self):
        self.current_phase = "Processing live stream"

        # Start frame reader process
        frame_reader_process = multiprocessing.Process(target=self.frame_reader, args=(self.frame_queue,))
        frame_reader_process.start()

        # Start processing processes
        processes = []
        for _ in range(self.num_processes):
            p = multiprocessing.Process(target=self.process_frames, args=([], self.result_queue))
            processes.append(p)
            p.start()

        try:
            while True:
                frames = []
                for _ in range(self.batch_size):
                    try:
                        frame = self.frame_queue.get(timeout=1)
                        frames.append(frame)
                    except queue.Empty:
                        break

                if frames:
                    for p in processes:
                        if not p.is_alive():
                            p.terminate()
                            p = multiprocessing.Process(target=self.process_frames, args=(frames, self.result_queue))
                            p.start()

                    display_frame = frames[-1].copy()
                    while not self.result_queue.empty():
                        barcodes = self.result_queue.get()
                        for barcode, points in barcodes:
                            points = np.array(points, np.int32)
                            points = points.reshape((-1, 1, 2))
                            cv2.polylines(display_frame, [points], True, (0, 255, 0), 2)

                            font_scale = 0.5
                            thickness = 2
                            (text_width, text_height), _ = cv2.getTextSize(
                                barcode, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)

                            text_x = points[0][0][0]
                            text_y = points[0][0][1] - 10

                            cv2.rectangle(display_frame, (text_x, text_y - text_height),
                                          (text_x + text_width, text_y + 5), (0, 0, 0), -1)

                            cv2.putText(display_frame, barcode, (text_x, text_y),
                                        cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 255, 0), thickness)

                    cv2.imshow("Live Barcode Scanner", display_frame)

                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break

        except KeyboardInterrupt:
            self.logger.info("Interrupted by user.")
        finally:
            frame_reader_process.terminate()
            for p in processes:
                p.terminate()
            cv2.destroyAllWindows()
            self.logger.info("Stream processing ended")

def main():
    parser = argparse.ArgumentParser(description="Process live HLS stream for barcode detection")
    parser.add_argument("--hls-url", type=str, required=True, help="URL of the HLS stream")
    parser.add_argument("--processes", type=int, default=9, help="Number of processes to use")
    parser.add_argument("--batch-size", type=int, default=1, help="Number of frames to process in each batch")
    args = parser.parse_args()

    processor = LiveBarcodeProcessor(args.hls_url, args.processes, args.batch_size)
    processor.logger.info("-------------------start------------------------")

    try:
        processor.process_live_stream()
    except Exception as e:
        processor.logger.error(f"Unexpected error: {str(e)}")
        print(json.dumps({"status": "error", "message": str(e)}))

    processor.logger.info("-------------------over------------------------")

if __name__ == "__main__":
    main()