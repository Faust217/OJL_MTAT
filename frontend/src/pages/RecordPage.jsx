import React, { useRef, useState } from "react";
import axios from "axios";

const RecordPage = () => {
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [summary, setSummary] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [loading, setLoading] = useState(false);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert("🎤 麦克风权限获取失败：" + err.message);
    }
  };

  const stopRecording = async () => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder) return;

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", audioBlob, "full_recording.webm");

        try {
          setLoading(true);
          const res = await axios.post("http://localhost:8000/transcribe_chunk", formData);

          setTranscript(res.data.transcript || []);
          setSummary(res.data.summary || "");
          setSentiment(res.data.sentiment || "");
        } catch (err) {
          setTranscript([
            {
              start: 0,
              end: 0,
              text: `⚠️ Error: ${err.response?.data?.detail || err.message}`,
            },
          ]);
        } finally {
          setLoading(false);
        }

        setIsRecording(false);
        resolve();
      };

      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    });
  };

  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <h2>🎙 Simple Record & Transcribe</h2>
      <button
        onClick={isRecording ? stopRecording : startRecording}
        style={{ padding: "1rem", margin: "1rem" }}
      >
        {isRecording ? "⏹ Stop & Upload" : "▶️ Start Recording"}
      </button>

      {loading && <p>⏳ Processing audio...</p>}

      <div style={{ textAlign: "left", maxWidth: "600px", margin: "0 auto" }}>
        <h3>📝 Transcript</h3>
        <ul>
          {transcript.map((seg, index) => (
            <li key={index}>
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

        {sentiment && (
        <>
          <h3>💬 Sentiment Analysis (by Segment)</h3>
          <ul>
            {Array.isArray(sentiment) ? (
              sentiment.map((seg, index) => (
                <li key={index}>
                  {new Date(seg.start * 1000).toISOString().substr(14, 5)} -{" "}
                  {new Date(seg.end * 1000).toISOString().substr(14, 5)}:{" "}
                  {seg.sentiment} ({(seg.score * 100).toFixed(1)}%)
                </li>
              ))
            ) : (
              <p>{sentiment}</p> // fallback in case it's a string
            )}
          </ul>
        </>
      )}
      </div>
    </div>
  );
};

export default RecordPage;
