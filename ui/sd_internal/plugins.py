"""plugins.py: Handles plugins management.
Notes:
"""
import urllib3
import certifi
from . import Symbol

class PluginStates:
    class Installed(Symbol): pass
    class Enabled(Symbol): pass
    class Updating(Symbol): pass
    class Outdated(Symbol): pass
    class Broken(Symbol): pass
    class MetadataUnavailable(Symbol): pass

class PluginMeta:
    def __init__(self):
        self.state: PluginStates = PluginStates.MetadataUnavailable

PLUGIN_HTML_TAG = '<!-- PLUGINS SCRIPTS -->' # Tag to be replaced in index.html

known_plugins = []

http = urllib3.PoolManager(ca_certs=certifi.where())
DEFAULT_HEADERS = urllib3.make_headers(keep_alive=False, user_agent='Stable-Diffusion Self Awareness Systems V13.7')

def bundle(): # Concat a list of files to a series of stream using a generator.
    pass

def inject_loader(content:str): # Replace the comment in index.html by the script loader.
    loader = []
    for plugin in known_plugins:
        loader.append(f'<script type="text/javascript" src="{plugin.location}?v={id(content)}"></script>')
    return content.replace(PLUGIN_HTML_TAG, '\n'.join(loader))

def get_state(): # Return the list of known plugins with it's current state.
    pass

def get_metadata():
    #headers = {'Content-Type': 'application/json'})
    #data=json.loads(resp.data.decode('utf-8'))['json']
    pass

def get_modified_time(url):
    resp = http.request('HEAD', url, preload_content=True, redirect=True, headers=DEFAULT_HEADERS)
    print(resp.headers['Server'])
    print(resp.headers['Date'])
    print(resp.headers['Content-Type'])
    print(resp.headers['Last-Modified'])


def download_files():
    url = 'http://webcode.me'
    resp = http.request('GET', url, preload_content=False, redirect=True, headers=DEFAULT_HEADERS)
    print(resp.status)
    print(resp.geturl())
    with open(local_filename, 'wb') as f:
        for chunk in resp.stream(1024):
            f.write(chunk)
    resp.release_conn()
    #print(resp.data.decode('utf-8'))

def remove_files():
    pass
