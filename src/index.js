require("dotenv").config();

const { bootstrap } = require("./server");
const { createAppContext } = require("./appContext");

bootstrap(createAppContext()).catch((error) => {
  console.error("Failed to start service:", error);
  process.exit(1);
});
