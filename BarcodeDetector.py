import cv2
import numpy as np
from dbr import *
import multiprocessing
import os
import time
import csv
from collections import OrderedDict
import queue
import logging
import json
import argparse
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from typing import List, Tuple, Dict, Optional
from logging.handlers import RotatingFileHandler


class BarcodeProcessor:
    def __init__(self, video_file: str, fraction: float = 1.0):
        self.video_file = video_file
        self.fraction = fraction
        self.setup_logging()
        self.setup_barcode_reader()

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

    def process_segment(self, start_frame: int, end_frame: int, result_queue: multiprocessing.Queue):
        cap = cv2.VideoCapture(self.video_file)
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        dbr = BarcodeReader()

        with ThreadPoolExecutor(max_workers=1) as executor:
            for frame_number in range(start_frame, end_frame):
                ret, frame = cap.read()
                if not ret:
                    self.logger.warning(
                        f"Failed to read frame {frame_number}, skipping")
                    continue

                try:
                    future = executor.submit(self.process_frame, frame, dbr)
                    barcodes = future.result(timeout=10)
                    result_queue.put((frame_number, barcodes))

                    if frame_number % 100 == 0:
                        self.logger.info(f"Processed frame {frame_number}")
                except TimeoutError:
                    self.logger.error(
                        f"Timeout processing frame {frame_number}")
                except Exception as e:
                    self.logger.error(
                        f"Error processing frame {frame_number}: {str(e)}")

        cap.release()
        dbr.recycle_instance()

    def save_barcodes_to_csv(self, barcodes: Dict[str, int], filename: str):
        with open(filename, 'w', newline='') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['Barcode', 'Frame'])
            for barcode, frame in barcodes.items():
                writer.writerow([barcode, frame])
        self.logger.info(
            f"Saved {len(barcodes)} unique barcodes to {filename}")

    def process_video(self):
        cap = cv2.VideoCapture(self.video_file)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        process_frames = int(total_frames * self.fraction)

        num_processes = max(1, multiprocessing.cpu_count() - 1)
        frames_per_segment = process_frames // num_processes

        result_queue = multiprocessing.Queue()

        start_time = time.time()
        last_update_time = start_time

        processes = []
        for i in range(num_processes):
            start_frame = i * frames_per_segment
            end_frame = min(start_frame + frames_per_segment, process_frames)

            p = multiprocessing.Process(target=self.process_segment,
                                        args=(start_frame, end_frame, result_queue))
            processes.append(p)
            p.start()

        processed_frames = 0
        unique_barcodes = OrderedDict()
        barcode_locations = {}
        update_interval = 5

        try:
            while processed_frames < process_frames:
                time.sleep(0.1)

                current_time = time.time()
                elapsed_since_update = current_time - last_update_time

                frames_processed = 0
                new_barcodes = set()

                while True:
                    try:
                        frame_number, barcodes = result_queue.get_nowait()
                        frames_processed += 1
                        for barcode, points in barcodes:
                            if barcode not in unique_barcodes:
                                new_barcodes.add(barcode)
                                unique_barcodes[barcode] = frame_number
                            if frame_number not in barcode_locations:
                                barcode_locations[frame_number] = []
                            barcode_locations[frame_number].append(
                                (barcode, points))
                    except queue.Empty:
                        break

                processed_frames += frames_processed

                if elapsed_since_update >= update_interval:
                    self.print_progress(processed_frames, process_frames, frames_processed,
                                        unique_barcodes, new_barcodes, start_time, current_time)
                    self.save_barcodes_to_csv(
                        unique_barcodes, f"barcodes_{int(current_time)}.csv")
                    last_update_time = current_time
                else:
                    countdown = update_interval - int(elapsed_since_update)
                    print(
                        f"\rNext update in {countdown} seconds...", end="", flush=True)

        except KeyboardInterrupt:
            self.logger.info("Interrupted by user. Saving progress...")
        finally:
            self.save_barcodes_to_csv(unique_barcodes, "barcodes_final.csv")

            with open("barcode_locations.json", "w") as f:
                json.dump(barcode_locations, f)

            for p in processes:
                p.terminate()
                p.join()

        self.logger.info("Processing complete. Starting drawing phase...")
        self.draw_barcodes_on_video(barcode_locations, "output_video.mp4")

    def print_progress(self, processed_frames: int, process_frames: int, frames_processed: int,
                       unique_barcodes: Dict[str, int], new_barcodes: set, start_time: float, current_time: float):
        overall_progress = processed_frames / process_frames * 100
        elapsed_time = current_time - start_time
        estimated_total_time = elapsed_time / \
            (overall_progress / 100) if overall_progress > 0 else 0
        remaining_time = max(0, estimated_total_time - elapsed_time)

        os.system('cls' if os.name == 'nt' else 'clear')
        print(f"--- Update as of {time.strftime('%Y-%m-%d %H:%M:%S')} ---")
        print(f"Overall Progress: {overall_progress:.2f}%")
        print(f"Frames Processed: {processed_frames}/{process_frames}")
        print(f"Frames Processed in Last 30 seconds: {frames_processed}")
        print(f"Total Unique Barcodes: {len(unique_barcodes)}")
        print(f"New Barcodes in Last 30 seconds: {len(new_barcodes)}")
        print(f"Estimated Time Remaining: {remaining_time:.2f} seconds")
        print(f"\nNext update in 30 seconds...")

    def draw_barcodes_on_video(self, barcode_locations: Dict[int, List[Tuple[str, List[Tuple[int, int]]]]], output_video: str):
        cap = cv2.VideoCapture(self.video_file)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        out = cv2.VideoWriter(output_video, fourcc, fps, (width, height))

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        process_frames = int(total_frames * self.fraction)

        for frame_number in range(process_frames):
            ret, frame = cap.read()
            if not ret:
                self.logger.warning(
                    f"Failed to read frame {frame_number} during drawing phase, skipping")
                continue

            if frame_number in barcode_locations:
                for barcode, points in barcode_locations[frame_number]:
                    points = np.array(points, np.int32)
                    points = points.reshape((-1, 1, 2))
                    cv2.polylines(frame, [points], True, (0, 255, 0), 2)

                    # Increase text size and thickness
                    font_scale = 2.0  # Increased from default 0.5
                    thickness = 3  # Increased from default 1
                    (text_width, text_height), _ = cv2.getTextSize(
                        barcode, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)

                    # Adjust text position to accommodate larger text
                    text_x = points[0][0][0]
                    # Increased offset to prevent overlap with bounding box
                    text_y = points[0][0][1] - 20

                    # Add a filled rectangle behind the text for better visibility
                    cv2.rectangle(frame, (text_x, text_y - text_height),
                                  (text_x + text_width, text_y + 5), (0, 0, 0), -1)

                    cv2.putText(frame, barcode, (text_x, text_y),
                                cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 255, 0), thickness)

            out.write(frame)

            if frame_number % 100 == 0:
                print(f"Drawing frame {frame_number}/{process_frames}")

        cap.release()
        out.release()
        self.logger.info("Drawing phase complete.")


def main():
    parser = argparse.ArgumentParser(
        description="Process video for barcode detection")
    parser.add_argument("--fraction", type=float, default=1.0,
                        help="Fraction of video to process (e.g., 0.1 for 10%)")
    args = parser.parse_args()

    processor = BarcodeProcessor("video.mp4", args.fraction)
    processor.logger.info("-------------------start------------------------")

    try:
        processor.process_video()
    except Exception as e:
        processor.logger.error(f"Unexpected error: {str(e)}")

    processor.logger.info("-------------------over------------------------")


if __name__ == "__main__":
    main()
