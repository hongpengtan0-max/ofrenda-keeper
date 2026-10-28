# Records docs/demo.mp4 and screenshots with a headless browser. Sample memory is FICTIONAL.
import asyncio, os, shutil, subprocess, glob
from playwright.async_api import async_playwright
URL = os.environ.get('URL', 'http://localhost:4400')
OUT = os.path.join(os.path.dirname(__file__), '..', 'docs')
CAP = """(t)=>{let c=document.getElementById('cap');if(!c){c=document.createElement('div');c.id='cap';c.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:rgba(0,0,0,.82);color:#fde68a;padding:10px 18px;border-radius:10px;font:17px Georgia;z-index:9;max-width:80%;text-align:center';document.body.appendChild(c)}c.textContent=t}"""
M1 = "My grandmother Lucía made pan de muerto with orange zest. She told the story of crossing the river with my mother on her back. She liked boleros, I think, but I'm not sure which ones."
M2 = "She always said 'Ya llegará.' She kept her rosary in a cookie tin."
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 760}, record_video_dir='/tmp/ok_vid', record_video_size={'width': 1280, 'height': 760})
        pg = await ctx.new_page(); await pg.goto(URL); await pg.wait_for_timeout(1500)
        await pg.evaluate(CAP, 'Ofrenda Keeper: a local, offline ofrenda card maker (Mastra + Gemma 3 4B via Ollama)')
        await pg.wait_for_timeout(4000)
        await pg.evaluate(CAP, 'Sample memory below is FICTIONAL, written for this demo')
        await pg.type('#in', M1, delay=28)
        await pg.click('#send')
        await pg.evaluate(CAP, 'Gemma runs on this machine. Nothing is sent to a server.')
        await pg.wait_for_function("document.getElementById('send').textContent==='Remember this'", timeout=240000)
        await pg.evaluate(CAP, 'Only quoted details reach the card. The unsure "boleros" became a question instead.')
        await pg.wait_for_timeout(6000)
        await pg.screenshot(path=f'{OUT}/screenshots/01_card_after_first_memory.png')
        await pg.hover('.chip'); await pg.evaluate(CAP, 'Hover any detail to see the exact words it came from'); await pg.wait_for_timeout(4000)
        await pg.evaluate(CAP, 'Answering one of its questions (still fictional)')
        await pg.type('#in', M2, delay=28); await pg.click('#send')
        await pg.wait_for_function("document.getElementById('send').textContent==='Remember this'", timeout=240000)
        await pg.evaluate(CAP, 'Mastra memory keeps the whole conversation, so the card is rebuilt from everything said'); await pg.wait_for_timeout(6000)
        await pg.screenshot(path=f'{OUT}/screenshots/02_card_after_answer.png')
        await pg.evaluate(CAP, 'Same model, plain "fill every field" prompt, for comparison:'); await pg.click('#cmp')
        await pg.wait_for_function("document.getElementById('naive').innerHTML.includes('<b>')", timeout=240000)
        await pg.evaluate("document.getElementById('naive').scrollIntoView()")
        await pg.evaluate(CAP, 'Unguarded, the same model adds things nobody said. On the card, every detail has a quote.'); await pg.wait_for_timeout(8000)
        await pg.screenshot(path=f'{OUT}/screenshots/03_unguarded_comparison.png')
        await pg.evaluate(CAP, 'github.com/hongpengtan0-max/ofrenda-keeper  ·  MIT'); await pg.wait_for_timeout(4000)
        await ctx.close(); await b.close()
    v = max(glob.glob('/tmp/ok_vid/*.webm'), key=os.path.getmtime)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', v, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-movflags', '+faststart', f'{OUT}/demo.mp4'], check=True)
asyncio.run(main())
