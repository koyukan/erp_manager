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
    def __init__(self, video_file: str, start_time: float, end_time: float, num_processes: int = None, batch_size: int = 10):
        self.video_file = video_file
        self.start_time = start_time
        self.end_time = end_time
        self.num_processes = num_processes or max(1, multiprocessing.cpu_count() - 1)
        self.batch_size = batch_size
        self.setup_logging()
        self.setup_barcode_reader()
        self.barcode_data = []
        self.barcode_locations = {}  # Add this line
        self.current_phase = "Initializing"
        self.fps = None  # Add this line

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

    def process_segment(self, start_frame: int, end_frame: int, result_queue: multiprocessing.Queue):
        self.current_phase = f"Processing segment {start_frame}-{end_frame}"
        cap = cv2.VideoCapture(self.video_file)
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        dbr = BarcodeReader()

        with ThreadPoolExecutor(max_workers=self.batch_size) as executor:
            for frame_number in range(start_frame, end_frame, self.batch_size):
                frames = []
                for _ in range(self.batch_size):
                    if frame_number + _ >= end_frame:
                        break
                    ret, frame = cap.read()
                    if not ret:
                        self.logger.warning(f"Failed to read frame {frame_number + _}, skipping")
                        continue
                    frames.append((frame_number + _, frame))

                futures = [executor.submit(self.process_frame, frame, dbr) for _, frame in frames]
                
                for future, (frame_num, _) in zip(futures, frames):
                    try:
                        barcodes = future.result(timeout=10)
                        result_queue.put((frame_num, barcodes))
                    except TimeoutError:
                        self.logger.error(f"Timeout processing frame {frame_num}")
                    except Exception as e:
                        self.logger.error(f"Error processing frame {frame_num}: {str(e)}")

                if frame_number % 100 == 0:
                    self.logger.info(f"Processed frame {frame_number}")

        cap.release()
        dbr.recycle_instance()

    def process_video(self):
        self.current_phase = "Initializing video processing"
        cap = cv2.VideoCapture(self.video_file)
        self.fps = cap.get(cv2.CAP_PROP_FPS)  # Store fps as an instance variable
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        start_frame = int(self.start_time * self.fps)
        end_frame = min(int(self.end_time * self.fps), total_frames)
        
        cap.release()

        process_frames = end_frame - start_frame
        frames_per_segment = process_frames // self.num_processes
        result_queue = multiprocessing.Queue()

        start_time = time.time()
        last_update_time = start_time

        self.current_phase = "Starting parallel processing"
        processes = []
        for i in range(self.num_processes):
            segment_start_frame = start_frame + i * frames_per_segment
            segment_end_frame = min(segment_start_frame + frames_per_segment, end_frame)

            p = multiprocessing.Process(target=self.process_segment,
                                        args=(segment_start_frame, segment_end_frame, result_queue))
            processes.append(p)
            p.start()

        processed_frames = 0
        unique_barcodes = OrderedDict()
        update_interval = 5

        try:
            self.current_phase = "Processing frames"
            while processed_frames < process_frames:
                try:
                    frame_number, barcodes = result_queue.get(timeout=1)
                    processed_frames += 1
                    for barcode, points in barcodes:
                        if barcode not in unique_barcodes:
                            unique_barcodes[barcode] = frame_number
                            self.barcode_data.append((frame_number, barcode))
                        if frame_number not in self.barcode_locations:
                            self.barcode_locations[frame_number] = []
                        self.barcode_locations[frame_number].append((barcode, points))

                    current_time = time.time()
                    elapsed_since_update = current_time - last_update_time

                    if elapsed_since_update >= update_interval:
                        progress = self.print_progress(processed_frames, process_frames, len(unique_barcodes),
                                            start_time, current_time)
                        print(json.dumps(progress))  # Print progress as JSON
                        last_update_time = current_time

                except queue.Empty:
                    if all(not p.is_alive() for p in processes):
                        break

        except KeyboardInterrupt:
            self.logger.info("Interrupted by user. Saving progress...")
        finally:
            self.current_phase = "Saving results"
            for p in processes:
                if p.is_alive():
                    p.terminate()
                p.join()

        self.logger.info("Processing complete. Starting drawing phase...")

    def print_progress(self, processed_frames: int, process_frames: int, unique_barcodes_count: int,
                       start_time: float, current_time: float):
        overall_progress = processed_frames / process_frames * 100
        elapsed_time = current_time - start_time
        estimated_total_time = elapsed_time / (overall_progress / 100) if overall_progress > 0 else 0
        remaining_time = max(0, estimated_total_time - elapsed_time)

        progress = {
            "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
            "current_phase": self.current_phase,
            "overall_progress": overall_progress,
            "frames_processed": processed_frames,
            "total_frames": process_frames,
            "unique_barcodes": unique_barcodes_count,
            "remaining_time": remaining_time,
            "elapsed_time": elapsed_time
        }

        return progress

    def save_barcodes_to_csv(self, barcode_data: List[Tuple[int, str]], filename: str):
        with open(filename, 'w', newline='') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['Frame', 'Barcode'])
            for frame, barcode in barcode_data:
                writer.writerow([frame, barcode])
        self.logger.info(f"Saved {len(barcode_data)} barcodes to {filename}")

    def draw_barcodes_on_video(self, barcode_locations: Dict[int, List[Tuple[str, List[Tuple[int, int]]]]], output_video: str, start_frame: int, end_frame: int):
        self.current_phase = "Drawing barcodes on video"
        cap = cv2.VideoCapture(self.video_file)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        out = cv2.VideoWriter(output_video, fourcc, fps, (width, height))

        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        for frame_number in range(start_frame, end_frame):
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

                    font_scale = 2.0
                    thickness = 3
                    (text_width, text_height), _ = cv2.getTextSize(
                        barcode, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)

                    text_x = points[0][0][0]
                    text_y = points[0][0][1] - 20

                    cv2.rectangle(frame, (text_x, text_y - text_height),
                                  (text_x + text_width, text_y + 5), (0, 0, 0), -1)

                    cv2.putText(frame, barcode, (text_x, text_y),
                                cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 255, 0), thickness)

            out.write(frame)

            if frame_number % 100 == 0:
                os.system('cls' if os.name == 'nt' else 'clear')
                print(f"Drawing frame {frame_number - start_frame}/{end_frame - start_frame}")
                print(f"Progress: {(frame_number - start_frame)/(end_frame - start_frame)*100:.2f}%")

        cap.release()
        out.release()
        self.logger.info("Drawing phase complete.")

def main():
    parser = argparse.ArgumentParser(description="Process video for barcode detection")
    parser.add_argument("--video", type=str, required=True, help="Path to the input video file")
    parser.add_argument("--start-time", type=float, required=True, help="Start time in seconds")
    parser.add_argument("--end-time", type=float, required=True, help="End time in seconds")
    parser.add_argument("--processes", type=int, default=None, help="Number of processes to use")
    parser.add_argument("--batch-size", type=int, default=1, help="Number of frames to process in each batch")
    parser.add_argument("--output-dir", type=str, required=True, help="Directory to save output files")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    processor = BarcodeProcessor(args.video, args.start_time, args.end_time, args.processes, args.batch_size)
    processor.logger.info("-------------------start------------------------")

    try:
        processor.process_video()
        
        # Save output files
        csv_file = os.path.join(args.output_dir, f"barcodes_{int(time.time())}.csv")
        processor.save_barcodes_to_csv(processor.barcode_data, csv_file)
        
        json_file = os.path.join(args.output_dir, "barcode_locations.json")
        with open(json_file, "w") as f:
            json.dump(processor.barcode_locations, f)
        
        video_file = os.path.join(args.output_dir, "output_video.mp4")
        processor.draw_barcodes_on_video(processor.barcode_locations, video_file, 
                                         int(args.start_time * processor.fps), 
                                         int(args.end_time * processor.fps))
        
        print(json.dumps({
            "status": "completed",
            "output_files": {
                "csv": csv_file,
                "json": json_file,
                "video": video_file
            }
        }))
    except Exception as e:
        processor.logger.error(f"Unexpected error: {str(e)}")
        print(json.dumps({"status": "error", "message": str(e)}))

    processor.logger.info("-------------------over------------------------")

if __name__ == "__main__":
    main()