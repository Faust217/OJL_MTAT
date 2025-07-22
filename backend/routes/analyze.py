from fastapi import APIRouter, UploadFile, File
import os
import shutil
import uuid
import ffmpeg
from datetime import datetime

from services.transcriber import transcribe_audio
from services.summarizer import generate_summary
from services.sentiment import analyze_sentiment
from services.deepfake import extract_frames, predict_image

router = APIRouter()

@router.post("/analyze")
async def analyze_file(file: UploadFile = File(...)):
    # 1) 保存上传文件到 temp
    temp_dir = "temp"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    ext = file.filename.rsplit(".", 1)[-1].lower()

    # --- 音频分析 ---
    if ext in ["mp3", "wav"]:
        transcript = transcribe_audio(file_path)
        summary = generate_summary(transcript)
        sentiment = analyze_sentiment(transcript)
        # 清理
        os.remove(file_path)
        return {
            "type": "audio",
            "transcript": transcript,
            "summary": summary,
            "sentiment": sentiment
        }

    # --- 视频分析 ---
    elif ext in ["mp4", "avi", "mov"]:
        # (A) 创建静态帧输出目录
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        frame_output_dir = os.path.join("static", "frames", timestamp)
        os.makedirs(frame_output_dir, exist_ok=True)

        # (B) 每 30s 抽帧并检测
        frames = extract_frames(file_path, frame_output_dir, interval_sec=30)
        frame_results = []
        fake_count = 0
        for frame_path in frames:
            label, score = predict_image(frame_path)
            if label == "Fake":
                fake_count += 1
            fname = os.path.basename(frame_path)
            frame_results.append({
                "label": label,
                "score": round(score * 100, 1),
                "image_url": f"/static/frames/{timestamp}/{fname}"
            })

        # (C) 提取音频并转为 wav
        audio_path = os.path.join(temp_dir, "audio.wav")
        try:
            (
                ffmpeg
                .input(file_path)
                .output(audio_path, ac=1, ar=16000)
                .overwrite_output()
                .run(quiet=True)
            )
        except Exception as e:
            return {"error": f"Failed to extract audio: {str(e)}"}

        # (D) 音频转录/摘要/情感
        transcript = transcribe_audio(audio_path)
        summary = generate_summary(transcript)
        sentiment = analyze_sentiment(transcript)

        # (E) 清理临时文件
        for p in [audio_path, file_path]:
            if os.path.exists(p):
                os.remove(p)

        return {
            "type": "video",
            "frames_checked": len(frames),
            "fake_frames": fake_count,
            "frame_details": frame_results,      # ← 前端用到的字段名
            "transcript": transcript,
            "summary": summary,
            "sentiment": sentiment
        }

    else:
        # 不支持的文件格式
        os.remove(file_path)
        return {"error": "Unsupported file type."}


@router.post("/analyze_frame")
async def analyze_frame(file: UploadFile = File(...)):
    # 备用：单帧检测接口
    filename = f"temp/frame_{uuid.uuid4().hex}.jpg"
    with open(filename, "wb") as f:
        f.write(await file.read())
    label, score = predict_image(filename)
    os.remove(filename)
    return {"label": label, "score": score}
