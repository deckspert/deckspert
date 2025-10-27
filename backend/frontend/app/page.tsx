import dynamic from "next/dynamic";

const Uploader = dynamic(() => import("../components/DeckSpertUploaderWithProgress"), { ssr: false });

export default function Page() {
  return (
    <div
      style={{
        padding: "24px",
        fontFamily: "sans-serif",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontWeight: 700,
          fontSize: "28px",
          marginBottom: "16px",
        }}
      >
        DeckSpert.AI — MVP Uploader
      </h1>
      <p style={{ marginBottom: "20px", fontSize: "16px", color: "#555" }}>
        AI가 당신의 IR Deck을 분석하고, 개선 포인트를 제안합니다.
      </p>
      <Uploader />
    </div>
  );
}
