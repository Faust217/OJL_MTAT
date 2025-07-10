import cv2
import os

def extract_frames(video_path, output_folder='frames', interval=30):
    """
    从视频中每隔 interval 帧提取一帧图像保存到指定目录。
    参数:
    - video_path: 视频文件路径
    - output_folder: 提取的帧保存的文件夹名
    - interval: 每隔多少帧提取一次
    """
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    cap = cv2.VideoCapture(video_path)
    frame_count = 0
    saved_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_count % interval == 0:
            filename = os.path.join(output_folder, f"frame_{saved_count}.jpg")
            cv2.imwrite(filename, frame)
            saved_count += 1

        frame_count += 1

    cap.release()
    print(f"✅ 提取完成！共保存 {saved_count} 张帧图像。")

if __name__ == "__main__":
    extract_frames("testDF.mp4", output_folder="extracted_frames", interval=30)
