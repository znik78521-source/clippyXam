// Pinned public model revision; no API key or conversation is sent to the host.
const revision = "c10ece1aade47bb51c153c893d14e5bf8e5b7117";
const base = `https://huggingface.co/rhasspy/piper-voices/resolve/${revision}/ru/ru_RU/denis/medium/`;
module.exports = {
  revision,
  files: [
    {
      name: "ru_RU-denis-medium.onnx",
      size: 63201294,
      sha256:
        "15fab56e11a097858ee115545d0f697fc2a316c41a291a5362349fb870411b0a",
    },
    {
      name: "ru_RU-denis-medium.onnx.json",
      size: 4823,
      gitSha1: "298fb1cdb5deb29defaeb53df285c6d269839a3d",
    },
    {
      name: "MODEL_CARD",
      size: 276,
      gitSha1: "03daf73091666615fa7aeec626792b5003d7fd76",
    },
  ].map((file) => ({ ...file, url: base + file.name })),
};
