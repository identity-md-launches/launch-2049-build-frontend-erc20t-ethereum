import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<html><body style="margin:0;background:#173e31;color:#f1f7ed;font-family:Arial,sans-serif"><main style="padding:66px 76px;position:relative;height:498px"><div style="font-size:28px;font-weight:bold;display:flex;align-items:center;gap:14px"><span style="width:40px;height:40px;display:grid;place-items:center;border:1px solid #86ac75;border-radius:9px;color:#d5efbd">T</span>ERC20T</div><h1 style="font-size:84px;line-height:1.08;letter-spacing:-4px;margin:72px 0 24px;max-width:700px">Launch your token.</h1><p style="font-size:27px;color:#c3d3c3;max-width:660px;line-height:1.5;margin:0">Token-only liquidity.<br>Permanently locked on Ethereum.</p><svg style="position:absolute;right:65px;top:190px" width="230" height="230" viewBox="0 0 230 230"><circle cx="115" cy="115" r="98" fill="none" stroke="#355941" stroke-width="15"/><circle cx="115" cy="115" r="98" fill="none" stroke="#d5efbd" stroke-width="15" stroke-dasharray="554 62" transform="rotate(-90 115 115)"/><path d="M90 111v-20a25 25 0 0 1 50 0v20m-59 0h68v53H81z" fill="none" stroke="#d5efbd" stroke-width="6" stroke-linejoin="round"/><circle cx="115" cy="137" r="5" fill="#d5efbd"/></svg><div style="position:absolute;bottom:5px;left:76px;right:76px;border-top:1px solid #3a5c48;padding-top:22px;font-size:19px;color:#c3d3c3">Ethereum mainnet <span style="float:right">Powered by Uniswap v4</span></div></main></body></html>`,
  );
  await mkdir("public", { recursive: true });
  await page.screenshot({ path: "public/share.png" });
} finally {
  await browser.close();
}
