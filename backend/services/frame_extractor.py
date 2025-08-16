import cv2
import os

def extract_frames(video_path, output_dir="extracted_frames", interval_sec=30):
    '''   
    Extract frames from a video every `interval_sec` seconds and save them to `output_dir`.

    Args:
        video_path (str): Path to the input video.
        output_dir (str): Output directory to store extracted frames (default: "extracted_frames").
        interval_sec (int): Interval in seconds between saved frames.

    Returns:
        list[str]: Absolute or relative file paths to the saved frames (in order).
    '''
    vidcap = cv2.VideoCapture(video_path)
    if not vidcap.isOpened():
        print(f"[frame_extractor] Failed to open video: {video_path}")
        return []

    # Read FPS; guard against 0/None to avoid modulo-by-zero later
    fps = vidcap.get(cv2.CAP_PROP_FPS) or 0
    if fps <= 0:
        # Fallback to 1 FPS to keep extraction logic running
        fps = 1.0

    # Number of frames between saves
    interval = max(1, int(fps * interval_sec))

    success, image = vidcap.read()
    count = 0
    saved = 0
    frame_paths = []

    # Respect caller's output_dir (default remains "extracted_frames")
    os.makedirs(output_dir or "extracted_frames", exist_ok=True)
    outdir = output_dir or "extracted_frames"

    while success:
        # Save one frame every `interval` frames
        if count % interval == 0:
            frame_filename = f"{outdir}/frame{saved}.jpg"
            cv2.imwrite(frame_filename, image)
            frame_paths.append(frame_filename)
            saved += 1

        success, image = vidcap.read()
        count += 1

    vidcap.release()
    print(f"[frame_extractor] Extraction completed. Saved: {saved} frames.")
    return frame_paths