import cv2
import os

def extract_frames(video_path, output_dir="extracted_frames", interval_sec=30):
    vidcap = cv2.VideoCapture(video_path)
    fps = vidcap.get(cv2.CAP_PROP_FPS)
    interval = int(fps * interval_sec)  # 每 interval 秒提取一帧

    success, image = vidcap.read()
    count = 0
    saved = 0
    frame_paths = []

    os.makedirs("extracted_frames", exist_ok=True)

    while success:
        if count % interval == 0:
            frame_filename = f"extracted_frames/frame{saved}.jpg"
            cv2.imwrite(frame_filename, image)
            frame_paths.append(frame_filename)
            saved += 1
        success, image = vidcap.read()
        count += 1

    vidcap.release()
    print(f"✅ 提取完成！共保存 {saved} 张帧图像。")
    return frame_paths
