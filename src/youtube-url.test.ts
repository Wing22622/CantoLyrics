import { describe, expect, it } from "vitest";
import { parseYoutubeUrl } from "./youtube-url";

const ID = "dQw4w9WgXcQ";
const CANONICAL = `https://www.youtube.com/watch?v=${ID}`;

describe("parseYoutubeUrl", () => {
  it("accepts watch, shorts, embed, live, youtu.be, and music links", () => {
    const accepted = [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}&list=PL123`,
      `http://m.youtube.com/watch?v=${ID}`,
      `https://www.youtube.com/watch?list=PL123&v=${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/shorts/${ID}/`,
      `https://www.youtube.com/shorts/${ID}?feature=share`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube.com/v/${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?t=12`,
      `https://www.youtu.be/${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}&list=RDAMVM`,
      `  https://www.youtube.com/watch?v=${ID}&feature=youtu.be  `,
    ];
    for (const input of accepted) {
      expect(parseYoutubeUrl(input), input).toEqual({ videoId: ID, canonical: CANONICAL });
    }
  });

  it("rejects other hosts, missing ids, and non-video URLs", () => {
    const rejected = [
      "",
      "not a url",
      `https://example.com/watch?v=${ID}`,
      `https://youtube.com.evil.example/watch?v=${ID}`,
      `https://evil.example/?url=https://www.youtube.com/watch?v=${ID}`,
      `https://notyoutube.com/watch?v=${ID}`,
      `https://www.youtu.be.evil.com/${ID}`,
      `https://music.youtube.com.evil.example/watch?v=${ID}`,
      `https://www.youtube.com/watch?v=short`,
      `https://www.youtube.com/watch?v=${ID}x`,
      `https://www.youtube.com/watch?v=dQw4w9WgXc`,
      `https://www.youtube.com/channel/UC1234567890123456789012`,
      `https://www.youtube.com/playlist?list=PL123456789012345678901`,
      `https://www.youtube.com/shorts/`,
      `https://www.youtube.com/shorts/${ID}/extra`,
      `https://youtu.be/`,
      `https://youtu.be/${ID}/playlist`,
      "javascript:alert(1)",
      `ftp://www.youtube.com/watch?v=${ID}`,
      `https://user:pass@www.youtube.com/watch?v=${ID}`,
      `https://www.youtube.com:444/watch?v=${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `https://gaming.youtube.com/watch?v=${ID}`,
    ];
    for (const input of rejected) {
      expect(parseYoutubeUrl(input), input).toBeNull();
    }
  });
});
