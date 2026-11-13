# Genera dos mazos de Anki pequeños para las pruebas de apkg.test.ts:
#   viejo.apkg → collection.anki2 (decks en JSON dentro de col)
#   nuevo.apkg → collection.anki21b comprimida con zstd (tabla decks) + aviso collection.anki2
# Uso: python3 src/study/fixtures/make-apkg.py   (necesita: pip install zstandard)
import json, os, sqlite3, tempfile, zipfile
import zstandard

HERE = os.path.dirname(os.path.abspath(__file__))
CRT = 1_700_000_000 - (1_700_000_000 % 86400)  # día de creación de la colección
SEP = '\x1f'

def build(path, new_format):
    db = sqlite3.connect(path)
    db.executescript('''
      create table col (id integer primary key, crt integer, decks text);
      create table notes (id integer primary key, guid text, mid integer, flds text);
      create table cards (id integer primary key, nid integer, did integer, ord integer, type integer, queue integer,
        due integer, ivl integer, factor integer, reps integer, lapses integer, odue integer, odid integer, data text);
    ''')
    if new_format:
        db.execute('create table decks (id integer primary key, name text)')
        db.executemany('insert into decks values (?, ?)', [(1, 'Default'), (10, 'Lengua' + SEP + 'Tema 1'), (20, 'Lengua' + SEP + 'Tema 2')])
        db.execute('insert into col values (1, ?, ?)', (CRT, ''))
    else:
        decks = {'1': {'name': 'Default'}, '10': {'name': 'Lengua::Tema 1'}, '20': {'name': 'Lengua::Tema 2'}}
        db.execute('insert into col values (1, ?, ?)', (CRT, json.dumps(decks)))
    notes = [
        (100, 'a', 1, '¿Qué es el <b>emisor</b>?' + SEP + 'Quien envía el mensaje'),
        (101, 'b', 1, 'Canal' + SEP + 'Medio físico<br>(aire, pantalla)'),
        (102, 'c', 2, 'La {{c1::mitosis}} da {{c2::dos::número}} células' + SEP + ''),
    ]
    db.executemany('insert into notes values (?,?,?,?)', notes)
    cards = [
        # id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, odue, odid, data
        (1, 100, 10, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, ''),                          # nueva
        (2, 101, 10, 0, 2, 2, 30, 10, 2500, 4, 1, 0, 0, '{"s":12.5,"d":6.2}'),  # repaso con FSRS
        (3, 101, 10, 1, 2, 2, 25, 5, 2500, 3, 0, 0, 0, ''),                    # inversa, repaso sin FSRS
        (4, 102, 20, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, ''),                          # hueco c1
        (5, 102, 20, 1, 0, -1, 3, 0, 0, 0, 0, 0, 0, ''),                         # hueco c2, suspendida
    ]
    db.executemany('insert into cards values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', cards)
    db.commit(); db.close()

with tempfile.TemporaryDirectory() as tmp:
    old = os.path.join(tmp, 'old.db'); build(old, False)
    with zipfile.ZipFile(os.path.join(HERE, 'viejo.apkg'), 'w') as z:
        z.write(old, 'collection.anki2'); z.writestr('media', '{}')
    new = os.path.join(tmp, 'new.db'); build(new, True)
    dummy = os.path.join(tmp, 'dummy.db'); sqlite3.connect(dummy).close()
    with zipfile.ZipFile(os.path.join(HERE, 'nuevo.apkg'), 'w') as z:
        z.writestr('collection.anki21b', zstandard.ZstdCompressor().compress(open(new, 'rb').read()))
        z.write(dummy, 'collection.anki2')
print('ok')
