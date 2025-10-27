"use client";

import React, { useState } from "react";
import { callBackendParserDynamicWithProgress, assertSizeWithinLimit } from "../lib/upload-adapter-v2";

export default function DeckSpertUploaderWithProgress() {
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<string>("파일을 선택해주세요");
  const [result, setResult] = useState<any>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      assertSizeWithinLimit(file);
      setIsUploading(true);
      setStatus("업로드 중...");
      setProgress(0);
      const parsed = await callBackendParserDynamicWithProgress(file, (p) => setProgress(p));
      setResult(parsed);
      setStatus("완료!");
    } catch (err: any) {
      console.error(err);
      setStatus(`에러: ${err.message || err}`);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div
      style={{
        border: "2px dashed #ccc",
        padding: "24px",
        borderRadius: "16px",
        maxWidth: "600px",
        margin: "0 auto",
        textAlign: "center",
        backgroundColor: "#fafafa",
      }}
    >
      <h2 style={{ fontSize: "18px", marginBottom: "12px" }}>IR Deck 업로드</h2>
      <input
        type="file"
        accept=".pdf,.ppt,.pptx"
        disabled={isUploading}
        onChange={handleFile}
        style={{ marginBottom: "12px" }}
      />
      <div style={{ height: "10px", background: "#eee", borderRadius: "8px", overflow: "hidden" }}>
        <div
          style={{
            height: "10px",
            width: `${progress}%`,
            background: progress < 100 ? "#0070f3" : "#00c853",
            transition: "width 0.2s ease",
          }}
        />
      </div>
      <p style={{ marginTop: "12px", fontWeight: 500 }}>{status}</p>
      {result && (
        <pre
          style={{
            textAlign: "left",
            background: "#fff",
            padding: "12px",
            borderRadius: "8px",
            marginTop: "16px",
            fontSize: "14px",
            overflowX: "auto",
            border: "1px solid #eee",
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
