"""Local desktop diary with optional, explicitly requested online nutrition lookup."""
import argparse
import json
import os
import secrets
import subprocess
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from storage import Store, Conflict
from nutrition_assistant import NutritionAssistant, AssistantError

ROOT = Path(__file__).resolve().parent


def make_server(directory=None, port=0, desktop=False):
    store = Store(directory or ROOT / 'data', (ROOT / 'seed.json' if (ROOT / 'seed.json').exists() else ROOT / 'seed.public.json'))
    assistant = NutritionAssistant(store.directory)
    token = secrets.token_urlsafe(32)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, status, body, mime='application/json; charset=utf-8'):
            data = body.encode('utf-8') if isinstance(body, str) else json.dumps(body, ensure_ascii=False, allow_nan=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(data)

        def allowed(self, api=False):
            expected = f'127.0.0.1:{self.server.server_port}'
            if self.headers.get('Host') != expected:
                self.reply(403, {'error': 'Endereço não autorizado.'})
                return False
            if api and (self.headers.get('X-Session') != token or self.headers.get('Origin') not in (None, f'http://{expected}')):
                self.reply(403, {'error': 'Sessão inválida. Abra novamente o aplicativo.'})
                return False
            return True

        def do_GET(self):
            path = urlsplit(self.path).path
            if not self.allowed(path.startswith('/api/')):
                return
            if path == '/api/state':
                self.reply(200, store.read())
            elif path == '/api/ai/status':
                self.reply(200, assistant.status())
            elif path in ('/', '/app.css', '/app.js'):
                name = 'index.html' if path == '/' else path[1:]
                content = (ROOT / 'ui' / name).read_text(encoding='utf-8')
                if path == '/':
                    content = content.replace('__SESSION__', token)
                    content = content.replace('__DESKTOP__', 'desktop' if desktop else '')
                mime = {'index.html': 'text/html', 'app.css': 'text/css', 'app.js': 'text/javascript'}[name]
                self.reply(200, content, mime + '; charset=utf-8')
            else:
                self.reply(404, {'error': 'Página não encontrada.'})

        def do_POST(self):
            if not self.allowed(True):
                return
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 20_000_000:
                    raise ValueError('Requisição vazia ou maior que 20 MB.')
                payload = json.loads(self.rfile.read(size))
                if self.path == '/api/ai/configure':
                    self.reply(200, assistant.configure(payload.get('key')))
                elif self.path == '/api/ai/remove':
                    self.reply(200, assistant.remove_key())
                elif self.path == '/api/ai/estimate':
                    self.reply(200, assistant.estimate(payload.get('description')))
                elif self.path in ('/api/save', '/api/restore'):
                    self.reply(200, store.save(payload['state'], payload['revision'], self.path == '/api/restore'))
                elif self.path == '/api/backup':
                    backup = store.backup()
                    self.reply(200, {'name': backup.name, 'state': store.read()['state']})
                elif self.path == '/api/quit':
                    self.reply(200, {'ok': True})
                    threading.Thread(target=self.server.shutdown, daemon=True).start()
                else:
                    self.reply(404, {'error': 'Ação não encontrada.'})
            except Conflict as error:
                self.reply(409, {'error': str(error)})
            except AssistantError as error:
                self.reply(400, {'error': str(error)})
            except (ValueError, KeyError, TypeError, OverflowError) as error:
                self.reply(400, {'error': 'Dados inválidos: ' + str(error)})
            except Exception:
                self.reply(500, {'error': 'Não foi possível salvar. Confira o espaço em disco e tente novamente.'})

    return ThreadingHTTPServer(('127.0.0.1', port), Handler)


def open_window(url):
    for env in ('ProgramFiles(x86)', 'ProgramFiles', 'LOCALAPPDATA'):
        base = os.environ.get(env)
        if base:
            edge = Path(base) / 'Microsoft' / 'Edge' / 'Application' / 'msedge.exe'
            if edge.exists():
                subprocess.Popen([str(edge), '--app=' + url, '--window-size=1320,900'])
                return
    webbrowser.open(url)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--data-dir', type=Path)
    args = parser.parse_args()
    server = make_server(args.data_dir, args.port)
    url = f'http://127.0.0.1:{server.server_port}'
    if not args.no_open:
        open_window(url)
    print(url, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
