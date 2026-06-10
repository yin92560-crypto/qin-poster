const app = require("./app");

const port = Number(process.env.PORT || 8787);

app.listen(port, () => {
  console.log(`勤海报后端已启动：http://127.0.0.1:${port}`);
});
