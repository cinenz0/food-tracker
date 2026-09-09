"""Food Tracker Windows shell. Personal data stays outside the executable."""
import argparse
import ctypes
import json
import os
import sys
import threading
from pathlib import Path
from urllib.parse import urlsplit

from app import make_server


def default_data_directory():
    return Path(os.environ['LOCALAPPDATA']) / 'FoodTracker' / 'data'


class WindowControls:
    def __init__(self):
        self._window = None
        self._maximized = False

    def close(self):
        self._window.destroy()

    def minimize(self):
        self._window.minimize()

    def maximize(self):
        if self._maximized:
            self._window.restore()
        else:
            self._window.maximize()

    def _on_maximized(self):
        self._maximized = True

    def _on_restored(self):
        self._maximized = False


def main():
    import webview

    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', type=Path, default=default_data_directory())
    parser.add_argument('--local', action='store_true', help='Abrir a cópia local sem sincronização')
    parser.add_argument('--cloud-url', help='Endereço HTTPS da versão sincronizada')
    parser.add_argument('--smoke-test', type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    # One native window per data directory; a second launch brings it forward.
    import hashlib
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
    kernel.CreateMutexW.restype = ctypes.c_void_p
    mutex_name = 'Local\\FoodTracker-' + hashlib.sha256(str(args.data_dir.resolve()).encode()).hexdigest()[:24]
    mutex = kernel.CreateMutexW(None, False, mutex_name)
    if not mutex:
        raise ctypes.WinError(ctypes.get_last_error())
    if ctypes.get_last_error() == 183:
        user = ctypes.windll.user32
        user.FindWindowW.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p]
        user.FindWindowW.restype = ctypes.c_void_p
        user.ShowWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]
        user.SetForegroundWindow.argtypes = [ctypes.c_void_p]
        handle = user.FindWindowW(None, 'Food Tracker')
        if handle:
            user.ShowWindow(handle, 9)
            user.SetForegroundWindow(handle)
        return
    cloud_url = args.cloud_url
    cloud_config = args.data_dir.parent / 'cloud-settings.json'
    if not cloud_url and cloud_config.exists():
        cloud_url = json.loads(cloud_config.read_text(encoding='utf-8-sig')).get('url')
    if args.local or args.smoke_test:
        cloud_url = None
    if cloud_url:
        parsed = urlsplit(cloud_url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
            raise ValueError('Use apenas o endereço HTTPS inicial do seu Food Tracker.')
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID('FoodTracker.Desktop')
    server = make_server(args.data_dir, desktop=True)
    controls = WindowControls()
    window = webview.create_window(
        'Food Tracker', cloud_url or f'http://127.0.0.1:{server.server_port}',
        js_api=controls, width=1320, height=900, min_size=(900, 650),
        frameless=True, easy_drag=False, background_color='#faf6f4',
    )
    controls._window = window
    window.events.maximized += controls._on_maximized
    window.events.restored += controls._on_restored
    window.events.closed += lambda: threading.Thread(target=server.shutdown, daemon=True).start()

    def serve():
        try:
            server.serve_forever(poll_interval=0.2)
        finally:
            server.server_close()
            try:
                window.destroy()
            except Exception:
                pass

    worker = threading.Thread(target=serve, daemon=True)
    worker.start()
    webview.settings['ALLOW_DOWNLOADS'] = True
    webview.settings['OPEN_EXTERNAL_LINKS_IN_BROWSER'] = True
    webview.settings['DRAG_REGION_DIRECT_TARGET_ONLY'] = True

    def smoke_test():
        import time
        result = {}
        try:
            window.events.loaded.wait(30)
            for _ in range(80):
                if window.evaluate_js("document.querySelector('#save-status').textContent === 'Todas as alterações salvas'"):
                    break
                time.sleep(0.25)
            result['loaded'] = window.evaluate_js("document.querySelector('#save-status').textContent === 'Todas as alterações salvas'")
            result['custom_controls'] = window.evaluate_js("document.querySelectorAll('[data-window]').length === 3 && document.body.classList.contains('desktop')")
            result['frameless'] = str(window.native.FormBorderStyle) == 'None'
            controls.maximize()
            time.sleep(0.4)
            result['maximize'] = controls._maximized
            controls.maximize()
            time.sleep(0.4)
            result['restore'] = not controls._maximized
            controls.minimize()
            time.sleep(0.4)
            result['minimize'] = str(window.native.WindowState) == 'Minimized'
            window.restore()
            result['passed'] = all(result.values())
        except Exception as error:
            result = {'passed': False, 'error': type(error).__name__ + ': ' + str(error)}
        finally:
            args.smoke_test.write_text(json.dumps(result), encoding='utf-8')
            window.destroy()

    try:
        webview.start(smoke_test if args.smoke_test else None, gui='edgechromium', private_mode=not bool(cloud_url), storage_path=str(args.data_dir.parent / 'webview') if cloud_url else None)
    finally:
        server.shutdown()
        worker.join(timeout=5)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        ctypes.windll.user32.MessageBoxW(
            0, 'Não foi possível abrir o Food Tracker.\n'
            'Confira se o Microsoft Edge WebView2 está instalado.\n\n' + str(error),
            'Food Tracker', 16,
        )
        sys.exit(1)
