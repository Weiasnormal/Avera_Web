import type { NewExaminationImage } from "@/stores/examinations";

// Practice signatures are drawn here and belong to nobody. Real case scans must
// never be used as tutorial material.

interface PenOptions {
  seed: number;
  /** The questioned signature is drawn more slowly and narrowly, so differences can be found. */
  questioned: boolean;
}

function drawSignature(context: CanvasRenderingContext2D, width: number, height: number, { seed, questioned }: PenOptions) {
  const jitter = (amount: number, salt: number) => Math.sin(seed * 12.9898 + salt * 78.233) * amount;
  const baseline = height * 0.58;
  const letterWidth = (questioned ? 58 : 72) + jitter(4, 1);
  const letterHeight = (questioned ? 58 : 76) + jitter(5, 2);
  const slant = questioned ? 0.08 : 0.35 + jitter(0.03, 3);

  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = questioned ? 6.5 : 4.5;
  context.strokeStyle = "#20202b";
  context.beginPath();

  // A run of joined loops, then a long lateral loop and a falling final stroke.
  let x = width * 0.12;
  context.moveTo(x, baseline);
  for (let letter = 0; letter < 4; letter += 1) {
    const rise = letterHeight * (letter === 1 ? 1.5 : 1) + jitter(6, letter + 4);
    const top = baseline - rise;
    context.bezierCurveTo(x + letterWidth * 0.5 + rise * slant, baseline, x + letterWidth * 0.75 + rise * slant, top, x + letterWidth * 0.4 + rise * slant, top);
    context.bezierCurveTo(x + rise * slant * 0.2, top, x + letterWidth * 0.1, baseline + 8, x + letterWidth * 0.8, baseline);
    x += letterWidth;
  }
  const loop = questioned ? 70 : 130 + jitter(8, 9);
  context.bezierCurveTo(x + loop, baseline + 20, x + loop * 1.2, baseline - loop * 1.6, x + loop * 0.5, baseline - loop * 1.5);
  context.bezierCurveTo(x - loop * 0.2, baseline - loop * 1.3, x - letterWidth, baseline + 30, x - letterWidth * 1.6, baseline + (questioned ? 50 : 105 + jitter(6, 11)));
  context.stroke();
}

async function signatureFile(name: string, options: PenOptions) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 520;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser couldn't draw the practice signatures.");
  context.fillStyle = "#f6f4ee";
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawSignature(context, canvas.width, canvas.height, options);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser couldn't draw the practice signatures.");
  return new File([blob], name, { type: "image/png" });
}

/** Made-up details, so nothing real appears on a practice report. */
export const PRACTICE_REPORT_DETAILS = {
  letterhead: { lines: ["SAMPLE FORENSIC LABORATORY", "Sample City", "Practice Report"], logoImageId: null },
  signOff: { name: "Alex Sample", credentials: "PhD", title: "Practice Document Examiner", notedBy: "Sam Example", useSignatureImage: true },
};

/** A made-up examiner's signature, on white for the signature line. */
export async function practiceSignature() {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 240;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser couldn't draw the practice signatures.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  context.lineWidth = 5;
  context.strokeStyle = "#1c2340";
  context.beginPath();
  context.moveTo(50, 170);
  context.bezierCurveTo(150, 10, 200, 20, 150, 170);
  context.bezierCurveTo(240, 90, 280, 90, 280, 150);
  context.bezierCurveTo(360, 40, 420, 60, 380, 150);
  context.bezierCurveTo(470, 110, 520, 120, 570, 90);
  context.stroke();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser couldn't draw the practice signatures.");
  return blob;
}

export async function practiceImages(): Promise<NewExaminationImage[]> {
  const standards = [1, 2, 3, 4];
  return [
    { file: await signatureFile("practice-questioned.png", { seed: 9, questioned: true }), role: "questioned" },
    ...(await Promise.all(
      standards.map(async (seed) => ({
        file: await signatureFile(`practice-standard-${seed}.png`, { seed, questioned: false }),
        role: "standard" as const,
      })),
    )),
  ];
}
