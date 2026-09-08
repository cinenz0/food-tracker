"""Local SQLite document store with validation and optimistic concurrency."""
import copy
import json
import math
import re
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path


class Conflict(ValueError):
    pass


def number(value, label, low=0, high=100000):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'{label}: informe um número entre {low} e {high}.')
    return value


def text(value, label, maximum=240):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError(f'{label}: texto obrigatório (até {maximum} caracteres).')
    return value


def valid_date(value):
    if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
        raise ValueError('Data inválida.')


def validate_food(food):
    text(food['id'], 'Identificador')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', food['id']):
        raise ValueError('Identificador de alimento inválido.')
    text(food['name'], 'Nome')
    text(food['unit'], 'Unidade', 30)
    text(food['source'], 'Origem', 500)
    number(food['base'], 'Porção de referência', .001)
    number(food['kcal'], 'Calorias')
    if food['protein'] is not None:
        number(food['protein'], 'Proteína')
    if food['confidence'] not in ('label', 'table', 'estimate'):
        raise ValueError('Origem nutricional inválida.')
    if not isinstance(food.get('favorite', False), bool):
        raise ValueError('Favorito inválido.')


def validate(state):
    if not isinstance(state, dict) or state.get('version') != 1:
        raise ValueError('Backup incompatível. Use um backup do Alimentação v1.')
    for key in ('foods', 'recipes', 'targets'):
        if not isinstance(state.get(key), list) or len(state[key]) > 10000:
            raise ValueError(f'Lista inválida: {key}.')
    ids = set()
    for food in state['foods']:
        validate_food(food)
        if food['id'] in ids:
            raise ValueError('Alimento duplicado.')
        ids.add(food['id'])
    recipe_ids = set()
    for recipe in state['recipes']:
        text(recipe['id'], 'Identificador')
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', recipe['id']):
            raise ValueError('Identificador de receita inválido.')
        if recipe['id'] in recipe_ids:
            raise ValueError('Receita duplicada.')
        recipe_ids.add(recipe['id'])
        text(recipe['name'], 'Receita')
        number(recipe['servings'], 'Rendimento', .001, 10000)
        if not isinstance(recipe['items'], list) or not 1 <= len(recipe['items']) <= 100:
            raise ValueError('Receita precisa ter entre 1 e 100 ingredientes.')
        for item in recipe['items']:
            if item['foodId'] not in ids:
                raise ValueError('Ingrediente não encontrado.')
            number(item['quantity'], 'Quantidade', .001)
    target_dates = set()
    if not state['targets']:
        raise ValueError('É preciso ter uma meta.')
    for target in state['targets']:
        valid_date(target['date'])
        if target['date'] in target_dates:
            raise ValueError('Há duas metas para a mesma data.')
        target_dates.add(target['date'])
        number(target['kcal'], 'Meta de calorias', 1, 20000)
        number(target['protein'], 'Meta de proteína', 0, 1000)
    if not isinstance(state.get('days'), dict) or len(state['days']) > 40000:
        raise ValueError('Histórico inválido.')
    entry_ids = set()
    for day_date, day in state['days'].items():
        valid_date(day_date)
        if not isinstance(day['complete'], bool) or not isinstance(day['entries'], list) or len(day['entries']) > 1000:
            raise ValueError('Dia inválido.')
        for entry in day['entries']:
            text(entry['id'], 'Identificador')
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', entry['id']):
                raise ValueError('Identificador de registro inválido.')
            if entry['id'] in entry_ids:
                raise ValueError('Registro duplicado.')
            entry_ids.add(entry['id'])
            text(entry['meal'], 'Refeição', 80)
            number(entry['quantity'], 'Quantidade', .001)
            validate_food(entry['food'])
    return state


def totals(day):
    kcal = protein = 0
    unknown = False
    for entry in day.get('entries', []):
        food = entry['food']
        factor = entry['quantity'] / food['base']
        kcal += food['kcal'] * factor
        if food['protein'] is None:
            unknown = True
        else:
            protein += food['protein'] * factor
    return {'kcal': kcal, 'protein': protein, 'unknownProtein': unknown}


class Store:
    def __init__(self, directory, seed):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / 'alimentacao.sqlite3'
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS document (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL)')
            if not db.execute('SELECT 1 FROM document').fetchone():
                state = validate(json.loads(Path(seed).read_text(encoding='utf-8')))
                db.execute('INSERT INTO document VALUES (1,0,?)', (json.dumps(state, ensure_ascii=False, allow_nan=False),))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            db.execute('PRAGMA synchronous=FULL')
            with db:
                yield db
        finally:
            db.close()

    def read(self):
        with self.connect() as db:
            revision, body = db.execute('SELECT revision,body FROM document WHERE id=1').fetchone()
        return {'revision': revision, 'state': json.loads(body)}

    def save(self, state, revision, restore=False):
        validate(state)
        body = json.dumps(state, ensure_ascii=False, allow_nan=False)
        if len(body.encode('utf-8')) > 20_000_000:
            raise ValueError('O arquivo excede 20 MB.')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current, previous = db.execute('SELECT revision,body FROM document WHERE id=1').fetchone()
            if current != revision:
                raise Conflict('Os dados mudaram em outra janela. Recarregue antes de tentar novamente.')
            if restore:
                self.backup_body(previous, 'antes-restauracao')
            db.execute('UPDATE document SET revision=?,body=? WHERE id=1', (current + 1, body))
        return {'revision': current + 1, 'state': copy.deepcopy(state)}

    def backup_body(self, body, prefix='alimentacao'):
        folder = self.directory / 'backups'
        folder.mkdir(exist_ok=True)
        path = folder / f'{prefix}-{datetime.now():%Y%m%d-%H%M%S-%f}.json'
        with path.open('x', encoding='utf-8') as file:
            file.write(body)
        return path

    def backup(self):
        return self.backup_body(json.dumps(self.read()['state'], ensure_ascii=False, indent=2))
