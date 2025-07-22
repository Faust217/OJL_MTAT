import React, { useRef, useState } from "react";
import axios from "axios";

const RecordPage = () => {
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const videoRef = useRef(null);
  const startTimeRef = useRef(0);
  const captureIntervalRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [summary, setSummary] = useState("");
  const [sentiment, setSentiment] = useState([]);
  const [deepfakeResults, setDeepfakeResults] = useState([]);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(null);

  // 开始录制
  const startRecording = async () => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

      if (videoRef.current) {
        videoRef.current.srcObject = displayStream;
      }

      const mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // 每30秒截图一次
      captureIntervalRef.current = setInterval(captureAndAnalyzeFrame, 10000);
    } catch (err) {
      alert("🎤 权限获取失败：" + err.message);
    }
  };

  const captureAndAnalyzeFrame = async () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const form = new FormData();
      form.append("file", blob, "frame.jpg");

      try {
        const res = await axios.post("http://localhost:8000/analyze_frame", form);
        const secs = (Date.now() - startTimeRef.current) / 1000;
        const mm = String(Math.floor(secs / 60)).padStart(2, "0");
        const ss = String(Math.floor(secs % 60)).padStart(2, "0");
        const timeLabel = `${mm}:${ss}`;
        const blobUrl = URL.createObjectURL(blob);

        setDeepfakeResults((prev) => [
          ...prev,
          {
            time: timeLabel,
            label: res.data.label,
            score: (res.data.score * 100).toFixed(1),
            imageBlob: blob,
            imageUrl: blobUrl,
          },
        ]);
      } catch (e) {
        console.error("Frame analysis error", e);
      }
    }, "image/jpeg");
  };

  const stopRecording = async () => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder) return;

      mediaRecorder.onstop = async () => {
        clearInterval(captureIntervalRef.current);

        if (videoRef.current?.srcObject) {
          videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        }
        mediaRecorder.stream.getTracks().forEach((t) => t.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", audioBlob, "full_recording.webm");

        try {
          setLoading(true);
          const res = await axios.post("http://localhost:8000/transcribe_chunk", formData);
          setTranscript(res.data.transcript || []);
          setSummary(res.data.summary || "");
          setSentiment(res.data.sentiment || []);
        } catch (err) {
          setTranscript([
            {
              start: 0,
              end: 0,
              text: `⚠️ ${err.response?.data?.detail || err.message}`,
            },
          ]);
        } finally {
          setLoading(false);
        }

        setIsRecording(false);
        resolve();
      };

      mediaRecorder.stop();
    });
  };

  const handleDownloadReport = () => {
    const report = {
      transcript,
      summary,
      sentiment,
      deepfake: deepfakeResults.map(({ time, label, score }) => ({ time, label, score })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meeting_report.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <h2>🎥 Record & Analyze Meeting</h2>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: "600px", maxHeight: "400px", background: "#000" }}
      />

      <br />
      <button
        onClick={isRecording ? stopRecording : startRecording}
        style={{ padding: "1rem", margin: "1rem" }}
      >
        {isRecording ? "⏹ Stop & Analyze" : "▶️ Start Recording"}
      </button>

      {loading && <p>⏳ Processing audio...</p>}

      <div style={{ textAlign: "left", maxWidth: "700px", margin: "1rem auto" }}>
        <h3>📝 Transcript</h3>
        <ul>
          {transcript.map((seg, i) => (
            <li key={i}>
              {new Date(seg.start * 1000).toISOString().substr(14, 5)} -{" "}
              {new Date(seg.end * 1000).toISOString().substr(14, 5)}: {seg.text}
            </li>
          ))}
        </ul>

        {summary && (
          <>
            <h3>🧠 Summary</h3>
            <p>{summary}</p>
          </>
        )}

        {sentiment.length > 0 && (
          <>
            <h3>💬 Sentiment Analysis</h3>
            <ul>
              {sentiment.map((seg, i) => (
                <li key={i}>
                  {new Date(seg.start * 1000).toISOString().substr(14, 5)} -{" "}
                  {new Date(seg.end * 1000).toISOString().substr(14, 5)}:{" "}
                  {seg.sentiment} ({(seg.score * 100).toFixed(1)}%)
                </li>
              ))}
            </ul>
          </>
        )}

        {deepfakeResults.length > 0 && (
          <>
            <h3>🕵️‍♀️ Deepfake Snapshot Results</h3>
            <ul>
              {deepfakeResults.map((d, i) => (
                <li key={i}>
                  [{d.time}] ▶ {d.label} ({d.score}%)
                  &nbsp;
                  <button onClick={() => setSelectedFrameIndex(i)}>🔍 查看帧</button>
                </li>
              ))}
            </ul>
          </>
        )}

        {selectedFrameIndex !== null && (
          <div style={{ marginTop: "1rem" }}>
            <h4>检测帧预览</h4>
            <img
              src={deepfakeResults[selectedFrameIndex].imageUrl}
              alt="frame"
              style={{ maxWidth: "90%", border: "1px solid #ccc" }}
            />
            <br />
            <button onClick={() => setSelectedFrameIndex(null)}>关闭</button>
          </div>
        )}

        {/* 下载报告 */}
        {(transcript.length > 0 || deepfakeResults.length > 0) && (
          <div style={{ marginTop: "2rem" }}>
            <button onClick={handleDownloadReport}>📥 下载分析报告 (JSON)</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordPage;
