import { trimInfo } from "./coachAudio";

const fakeBuf = (samples, sr = 1000) => ({ sampleRate: sr, getChannelData: () => Float32Array.from(samples) });

describe("trimInfo", () => {
  test("schneidet Stille vorne und hinten weg", () => {
    // 500 ms Stille, 200 ms Ton, 300 ms Stille
    const s = [...Array(500).fill(0), ...Array(200).fill(0.5), ...Array(300).fill(0)];
    const c = trimInfo(fakeBuf(s));
    expect(c.offset).toBeCloseTo(0.47, 2);
    expect(c.dur).toBeGreaterThan(0.2);
    expect(c.dur).toBeLessThan(0.4);
  });
  test("stumme Aufnahme gilt als fehlend", () => {
    expect(trimInfo(fakeBuf(Array(1000).fill(0.001)))).toBeNull();
  });
});
