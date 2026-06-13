:root {
  --primary: #4F46E5;
  --primary-light: #EEF2FF;
  --bg: #F9FAFB;
  --surface: #FFFFFF;
  --border: #E5E7EB;
  --text: #111827;
  --text-sec: #6B7280;
  --text-ter: #9CA3AF;
  --green: #10B981;
  --green-bg: #D1FAE5;
  --red: #EF4444;
  --red-bg: #FEE2E2;
  --yellow-bg: #FEF3C7;
  --yellow-fg: #B45309;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); }
button { font-family: inherit; cursor: pointer; border: none; }
input, select, textarea { font-family: inherit; }

.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #EEF2FF, #fff); }
.login-card { background: #fff; padding: 40px; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); width: 100%; max-width: 400px; }
.logo { font-size: 40px; font-weight: 900; color: var(--primary); letter-spacing: -2px; }
.muted { color: var(--text-ter); font-size: 14px; }
.label { font-size: 13px; font-weight: 600; color: var(--text-sec); display: block; margin-bottom: 6px; }
.input { width: 100%; height: 44px; border: 1.5px solid var(--border); border-radius: 10px; padding: 0 14px; font-size: 14px; margin-bottom: 14px; }
.input:focus { outline: none; border-color: var(--primary); }
.btn { background: var(--primary); color: #fff; font-weight: 700; height: 44px; border-radius: 10px; width: 100%; font-size: 15px; }
.btn:disabled { opacity: 0.5; }
.btn-sm { height: 34px; border-radius: 8px; padding: 0 14px; font-size: 13px; width: auto; }
.btn-green { background: var(--green); }
.btn-red { background: var(--red); }
.btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--text-sec); }
.err { background: var(--red-bg); color: var(--red); padding: 10px 14px; border-radius: 10px; font-size: 14px; margin-bottom: 14px; }

.shell { display: flex; min-height: 100vh; }
.sidebar { width: 220px; background: #fff; border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 24px 0; position: fixed; height: 100vh; }
.sidebar .logo { padding: 0 24px 24px; }
.nav-item { padding: 12px 24px; font-size: 14px; font-weight: 600; color: var(--text-sec); background: none; text-align: left; width: 100%; border-left: 3px solid transparent; }
.nav-item.active { color: var(--primary); background: var(--primary-light); border-left-color: var(--primary); }
.signout { margin-top: auto; padding: 12px 24px; color: var(--red); font-weight: 600; font-size: 14px; background: none; text-align: left; }
.main { margin-left: 220px; flex: 1; padding: 32px; max-width: 1100px; }
.h1 { font-size: 26px; font-weight: 900; margin-bottom: 4px; }
.sub { color: var(--text-sec); font-size: 14px; margin-bottom: 24px; }

.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
.stat { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 20px; }
.stat-label { font-size: 13px; color: var(--text-sec); font-weight: 600; }
.stat-value { font-size: 28px; font-weight: 900; margin-top: 4px; }

.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
.card-title { font-size: 16px; font-weight: 800; margin-bottom: 14px; }
.row { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--bg); }
.row:last-child { border-bottom: none; }
.row-title { font-weight: 700; font-size: 14px; }
.row-sub { font-size: 12px; color: var(--text-ter); margin-top: 2px; }

.badge { padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
.badge-green { background: var(--green-bg); color: var(--green); }
.badge-yellow { background: var(--yellow-bg); color: var(--yellow-fg); }
.badge-red { background: var(--red-bg); color: var(--red); }
.badge-gray { background: var(--bg); color: var(--text-sec); }

.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.kv { background: var(--bg); border-radius: 10px; padding: 12px; }
.kv-k { font-size: 11px; color: var(--text-ter); font-weight: 600; }
.kv-v { font-size: 14px; font-weight: 700; margin-top: 2px; }
.actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
.empty { text-align: center; color: var(--text-ter); padding: 40px; }
.list-item { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 10px; cursor: pointer; }
.list-item:hover { border-color: var(--primary); }
.list-item.selected { border-color: var(--primary); background: var(--primary-light); }
.split { display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; }
.textarea { width: 100%; border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 14px; resize: vertical; min-height: 64px; margin-bottom: 12px; }
.radio-row { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; cursor: pointer; }
.radio-row.on { border-color: var(--primary); background: var(--primary-light); }
.table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
.table th { text-align: left; padding: 12px 14px; font-size: 11px; text-transform: uppercase; color: var(--text-sec); background: var(--bg); }
.table td { padding: 12px 14px; font-size: 14px; border-top: 1px solid var(--bg); }
