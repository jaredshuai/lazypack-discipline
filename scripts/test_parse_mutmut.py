#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/test_parse_mutmut.py

mutmut 报告解析器断言驱动回归（仿 test_parse_stryker.mjs 模式）。
在系统临时目录生成 mutmut 文本捕获（results 节 + mutmut show diff）与
结果导出 JSON 夹具，以子进程方式调用 parse_mutmut_report.py，校验
stdout/stderr、--output 文件内容与退出码，不修改本仓库。
用法: python scripts/test_parse_mutmut.py
全过退出码 0；任一断言失败退出码 1。未接 hook/CI。
"""

import json
import os
import py_compile
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CLI = os.path.join(HERE, 'parse_mutmut_report.py')

MUTATION_TYPE_ENUM = frozenset([
    'ArithmeticOperator', 'ArrayDeclaration', 'ArrowFunction', 'Block',
    'BooleanLiteral', 'ConditionalExpression', 'EqualityOperator',
    'LogicalOperator', 'MethodExpression', 'MethodName', 'NegateCondition',
    'NumberLiteral', 'ObjectLiteral', 'OptionalChaining', 'Regex',
    'StringLiteral', 'SwitchStatement', 'UnaryOperator', 'UpdateOperator',
    'BreakContinue', 'ComparisonOperator', 'DecoratorRemoval',
    'KeywordArgument', 'KeywordLiteral', 'Unknown'
])

TIMESTAMP_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')


def assert_case(condition, message):
    if not condition:
        raise AssertionError(message)


def run_cli(args):
    proc = subprocess.run([sys.executable, CLI] + list(args), capture_output=True)
    return {
        'status': proc.returncode,
        'stdout': proc.stdout.decode('utf-8'),
        'stderr': proc.stderr.decode('utf-8')
    }


def make_case_dir(base, name):
    dir_path = os.path.join(base, name)
    os.makedirs(dir_path, exist_ok=True)
    return dir_path


def write_text(dir_path, name, content):
    file_path = os.path.join(dir_path, name)
    with open(file_path, 'wb') as handle:
        handle.write(content.encode('utf-8'))
    return file_path


def write_json(dir_path, name, data):
    return write_text(dir_path, name, json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def parse_stdout_json(cli, name):
    assert_case(cli['status'] == 0, '%s 退出码应为 0，实际 %s: %s' % (name, cli['status'], cli['stderr']))
    try:
        return json.loads(cli['stdout'])
    except ValueError as err:
        raise AssertionError('%s stdout 应为纯 JSON，解析失败：%s\nstdout: %r' % (name, err, cli['stdout']))


# --------------------------------------------------------------------
# 夹具：mutmut 文本捕获（results 节 + mutmut show diff），含进度噪声行
# --------------------------------------------------------------------

CAPTURE_TEXT = '\n'.join([
    '⠸ Running tests (12/34)',
    '',
    'Survived 🙈 (1)',
    'src/domain/pricing.py:4   - Mutation 7',
    'Suspicious 🤔 (1)',
    'src/services/cart.py:23   - Mutation 12',
    'Killed 🔪 (2)',
    'src/adapters/cli.py:5   - Mutation 1',
    'src/adapters/cli.py:9   - Mutation 2',
    'Timeout ⏰ (1)',
    'src/adapters/cli.py:15   - Mutation 3',
    '',
    '--- src/domain/pricing.py',
    '+++ src/domain/pricing.py',
    '@@ -4 +4 @@',
    '-    if total <= 0:',
    '+    if total < 0:',
    '',
    '--- src/services/cart.py',
    '+++ src/services/cart.py',
    '@@ -23 +23 @@',
    '-    if a and b:',
    '+    if a or b:',
    ''
]) + '\n'


def make_export(score=None):
    """构造 mutmut 结果导出 JSON（类别数组，survived/suspicious 为富条目）。"""
    export = {
        'killed': ['src/adapters/cli.py:5', 'src/adapters/cli.py:9', 'src/adapters/cli.py:15'],
        'timeout': ['src/adapters/cli.py:21'],
        'skipped': [],
        'untested': [],
        'suspicious': [{'file': 'src/services/cart.py', 'line': 23, 'original': 'and', 'mutated': 'or'}],
        'survived': [{'file': 'src/domain/pricing.py', 'line': 4, 'original': '<=', 'mutated': '<'}]
    }
    if score is not None:
        export['score'] = score
    return export


# --------------------------------------------------------------------
# 夹具：mutmut 2.x 原生缓存（.mutmut-cache，Pony ORM schema v4）与 show 输出
# --------------------------------------------------------------------

# 与 mutmut 2.5.1（Pony ORM）落盘的 DDL 一致：Line.sourcefile → SourceFile.id，
# Mutant.line → Line.id，行号 0 基（junitxml 输出 +1 可证）。
CACHE_DDL = (
    'CREATE TABLE "MiscData" ("key" VARCHAR PRIMARY KEY NOT NULL, "value" VARCHAR)',
    'CREATE TABLE "SourceFile" ("id" INTEGER PRIMARY KEY AUTOINCREMENT,'
    ' "filename" VARCHAR NOT NULL, "hash" VARCHAR)',
    'CREATE TABLE "Line" ("id" INTEGER PRIMARY KEY AUTOINCREMENT,'
    ' "line_number" INTEGER NOT NULL, "line" VARCHAR,'
    ' "sourcefile" INTEGER NOT NULL REFERENCES "SourceFile" ("id"))',
    'CREATE TABLE "Mutant" ("id" INTEGER PRIMARY KEY AUTOINCREMENT,'
    ' "index" INTEGER NOT NULL, "status" VARCHAR NOT NULL, "tested_against_hash" VARCHAR,'
    ' "line" INTEGER NOT NULL REFERENCES "Line" ("id"))',
)


def write_cache(dir_path, name, source_files, lines, mutants, version='4'):
    """按真实 Pony schema 生成 .mutmut-cache 夹具。

    source_files: [(filename, hash)]；lines: [(filename, line_number_0based, text)]；
    mutants: [(filename, line_number_0based, index, status)]；version=None 时不写版本行。
    """
    file_path = os.path.join(dir_path, name)
    conn = sqlite3.connect(file_path)
    try:
        for ddl in CACHE_DDL:
            conn.execute(ddl)
        if version is not None:
            conn.execute('INSERT INTO "MiscData" ("key", "value") VALUES (?, ?)',
                         ('version', version))
        file_ids = {}
        for index, (filename, file_hash) in enumerate(source_files, 1):
            file_ids[filename] = index
            conn.execute('INSERT INTO "SourceFile" ("id", "filename", "hash") VALUES (?, ?, ?)',
                         (index, filename, file_hash))
        line_ids = {}
        line_cursor = 1
        for filename, line_number, text in lines:
            line_ids[(filename, line_number)] = line_cursor
            conn.execute('INSERT INTO "Line" ("id", "line_number", "line", "sourcefile") VALUES (?, ?, ?, ?)',
                         (line_cursor, line_number, text, file_ids[filename]))
            line_cursor += 1
        for filename, line_number, index, status in mutants:
            conn.execute('INSERT INTO "Mutant" ("index", "status", "line") VALUES (?, ?, ?)',
                         (index, status, line_ids[(filename, line_number)]))
        conn.commit()
    finally:
        conn.close()
    return file_path


CACHE_FILES = [
    ('src/domain/pricing.py', 'hash-pricing'),
    ('src/services/cart.py', 'hash-cart'),
    ('src/adapters/cli.py', 'hash-cli'),
]

CACHE_LINES = [
    ('src/domain/pricing.py', 3, '    if total <= 0:'),
    ('src/services/cart.py', 22, '    if a and b:'),
    ('src/adapters/cli.py', 4, 'x = 1'),
    ('src/adapters/cli.py', 8, 'y = 2'),
    ('src/adapters/cli.py', 14, 'z = 3'),
    ('src/adapters/cli.py', 20, 'w = 4'),
]

# 全缓存 5 个变异体（按插入序 id=1..5）：2 ok_killed + 1 bad_timeout +
# 1 bad_survived + 1 ok_suspicious，分数 (2+1)/5 = 60，与 CAPTURE_TEXT 同口径。
CACHE_MUTANTS = [
    ('src/adapters/cli.py', 4, 1, 'ok_killed'),
    ('src/adapters/cli.py', 8, 1, 'ok_killed'),
    ('src/adapters/cli.py', 14, 1, 'bad_timeout'),
    ('src/domain/pricing.py', 3, 7, 'bad_survived'),
    ('src/services/cart.py', 22, 12, 'ok_suspicious'),
]

# mutmut show all 口径的 show 输出："# mutant <id>" 标记 + diff 块，
# 前置指引行与节标题行作为噪声一并容忍。
SHOW_TEXT = '\n'.join([
    'To apply a mutant on disk:',
    '    mutmut apply 4',
    '',
    'Survived 🙁 (1)',
    '---- src/domain/pricing.py (1) ----',
    '',
    '# mutant 4',
    '--- src/domain/pricing.py',
    '+++ src/domain/pricing.py',
    '@@ -4 +4 @@',
    '-    if total <= 0:',
    '+    if total < 0:',
    '',
    'Suspicious 🤔 (1)',
    '---- src/services/cart.py (1) ----',
    '',
    '# mutant 5',
    '--- src/services/cart.py',
    '+++ src/services/cart.py',
    '@@ -23 +23 @@',
    '-    if a and b:',
    '+    if a or b:',
    ''
]) + '\n'


# --------------------------------------------------------------------
# 用例
# --------------------------------------------------------------------

def case_help(base):
    """--help 输出用法、旗标与提取说明，退出码 0。"""
    cli = run_cli(['--help'])
    assert_case(cli['status'] == 0, '--help 退出码应为 0，实际 %s: %s' % (cli['status'], cli['stderr']))
    assert_case('Usage' in cli['stdout'], '--help 输出应含用法说明，实际：%s' % cli['stdout'])
    assert_case('--input' in cli['stdout'], '--help 应说明 --input')
    assert_case('--output' in cli['stdout'], '--help 应说明 --output')
    assert_case('--show' in cli['stdout'], '--help 应说明 --show')
    assert_case('Survived' in cli['stdout'], '--help 应说明保留 Survived')
    assert_case('Suspicious' in cli['stdout'], '--help 应说明保留 Suspicious')
    assert_case('mutmut' in cli['stdout'], '--help 应说明 mutmut 输入形态')
    assert_case('.mutmut-cache' in cli['stdout'], '--help 应说明 .mutmut-cache 缓存输入形态')


def case_h_alias(base):
    """-h 与 --help 等价。"""
    cli = run_cli(['-h'])
    assert_case(cli['status'] == 0, '-h 退出码应为 0，实际 %s: %s' % (cli['status'], cli['stderr']))
    assert_case('Usage' in cli['stdout'], '-h 输出应含用法说明')


def case_no_input_flag(base):
    """缺 --input 退出码 1，stderr 含用法文本。"""
    cli = run_cli([])
    assert_case(cli['status'] == 1, '缺 --input 退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('Usage' in cli['stderr'], 'stderr 应含用法文本，实际：%s' % cli['stderr'])
    assert_case('--input' in cli['stderr'], 'stderr 用法应提到 --input，实际：%s' % cli['stderr'])
    assert_case(cli['stdout'] == '', '缺 --input 时 stdout 应为空，实际：%r' % cli['stdout'])


def case_unknown_option(base):
    dir_path = make_case_dir(base, 'unknown-option')
    input_path = write_text(dir_path, 'capture.txt', CAPTURE_TEXT)
    cli = run_cli(['--input', input_path, '--bogus'])
    assert_case(cli['status'] == 1, '未知旗标退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('unknown option' in cli['stderr'], 'stderr 应提示未知旗标，实际：%s' % cli['stderr'])


def case_missing_value(base):
    cli = run_cli(['--input'])
    assert_case(cli['status'] == 1, '旗标缺值退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('missing value for --input' in cli['stderr'], 'stderr 应提示缺值，实际：%s' % cli['stderr'])


def case_duplicate_option(base):
    dir_path = make_case_dir(base, 'duplicate-option')
    input_path = write_text(dir_path, 'capture.txt', CAPTURE_TEXT)
    cli = run_cli(['--input', input_path, '--input', input_path])
    assert_case(cli['status'] == 1, '重复旗标退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('duplicate option' in cli['stderr'], 'stderr 应提示重复旗标，实际：%s' % cli['stderr'])


def case_input_file_missing(base):
    dir_path = make_case_dir(base, 'missing-file')
    missing = os.path.join(dir_path, 'nope.txt')
    cli = run_cli(['--input', missing])
    assert_case(cli['status'] == 1, '文件缺失退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('not found' in cli['stderr'], 'stderr 应提示文件未找到，实际：%s' % cli['stderr'])
    assert_case(missing in cli['stderr'], 'stderr 应包含缺失文件路径，实际：%s' % cli['stderr'])


def case_malformed_json(base):
    """以 { 开头的输入按 JSON 解析，语法错误退出码 1。"""
    dir_path = make_case_dir(base, 'malformed-json')
    input_path = write_text(dir_path, 'broken.json', '{ not json\n')
    cli = run_cli(['--input', input_path])
    assert_case(cli['status'] == 1, '畸形 JSON 退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('failed to parse' in cli['stderr'], 'stderr 应提示 JSON 解析失败，实际：%s' % cli['stderr'])


def case_format_error(base):
    """非 mutmut 文本与非导出 JSON 均退出码 1 并报格式错误。"""
    dir_path = make_case_dir(base, 'format-error')
    garbage = write_text(dir_path, 'garbage.txt', 'hello world\nthis is not mutmut output at all\n')
    cli = run_cli(['--input', garbage])
    assert_case(cli['status'] == 1, '非 mutmut 文本退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('mutmut' in cli['stderr'], 'stderr 应提示不是 mutmut 输出，实际：%s' % cli['stderr'])

    empty_json = write_text(dir_path, 'empty.json', '{}\n')
    cli = run_cli(['--input', empty_json])
    assert_case(cli['status'] == 1, '无类别 JSON 退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))

    array_json = write_text(dir_path, 'array.json', '[1, 2, 3]\n')
    cli = run_cli(['--input', array_json])
    assert_case(cli['status'] == 1, '裸数组 JSON 退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))


def case_valid_capture(base):
    """文本捕获（results + show）：统一格式、状态过滤、坐标、类型、分数。"""
    dir_path = make_case_dir(base, 'valid-capture')
    input_path = write_text(dir_path, 'mutmut_results.txt', CAPTURE_TEXT)
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, '有效捕获')

    assert_case(report['tool'] == 'mutmut', "tool 应为 'mutmut'，实际 %r" % report.get('tool'))
    assert_case(TIMESTAMP_RE.match(report['timestamp'] or ''), 'timestamp 应为 ISO-8601 UTC，实际 %r' % report.get('timestamp'))
    assert_case(len(report['mutants']) == 2, '应提取 2 个变异体（1 Survived + 1 Suspicious），实际 %d' % len(report['mutants']))

    first = report['mutants'][0]
    assert_case(first['id'] == 'mutmut-1', '排序后首个 id 应为 mutmut-1，实际 %r' % first.get('id'))
    assert_case(first['file'] == 'src/domain/pricing.py', '路径应保留，实际 %r' % first.get('file'))
    assert_case(first['line'] == 4, '行号应为 4，实际 %r' % first.get('line'))
    assert_case(first['column'] == 14, '列号应为 14（<= 所在列），实际 %r' % first.get('column'))
    assert_case(first['mutationType'] == 'ComparisonOperator', '类型应为 ComparisonOperator，实际 %r' % first.get('mutationType'))
    assert_case(first['original'] == '<=', 'original 应为 "<="，实际 %r' % first.get('original'))
    assert_case(first['mutated'] == '<', 'mutated 应为 "<"，实际 %r' % first.get('mutated'))
    assert_case(first['status'] == 'Survived', '状态应为 Survived，实际 %r' % first.get('status'))

    second = report['mutants'][1]
    assert_case(second['id'] == 'mutmut-2', '第二个 id 应为 mutmut-2，实际 %r' % second.get('id'))
    assert_case(second['file'] == 'src/services/cart.py', '第二个路径应为 cart.py，实际 %r' % second.get('file'))
    assert_case(second['line'] == 23 and second['column'] == 10, '坐标应为 23:10，实际 %s:%s' % (second.get('line'), second.get('column')))
    assert_case(second['mutationType'] == 'LogicalOperator', '类型应为 LogicalOperator，实际 %r' % second.get('mutationType'))
    assert_case(second['status'] == 'Suspicious', '状态应为 Suspicious，实际 %r' % second.get('status'))

    assert_case(report['score'] == 60, '分数应为 60（(2 killed + 1 timeout) / 5），实际 %r' % report.get('score'))
    assert_case('wrote' not in cli['stdout'], '缺 --output 时 stdout 应为纯 JSON，不应有摘要行')


def case_schema_strict_shape(base):
    """顶层与 mutant 严格字段集合、类型与枚举（VAL-MUTMUT-003）。"""
    dir_path = make_case_dir(base, 'schema-shape')
    input_path = write_text(dir_path, 'capture.txt', CAPTURE_TEXT)
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, 'schema')

    assert_case(set(report.keys()) == {'tool', 'timestamp', 'mutants', 'score'}, '顶层字段应为 tool/timestamp/mutants/score，实际 %s' % sorted(report.keys()))
    assert_case(isinstance(report['mutants'], list), 'mutants 应为数组')
    for mutant in report['mutants']:
        assert_case(set(mutant.keys()) == {'id', 'file', 'line', 'column', 'mutationType', 'original', 'mutated', 'status'}, 'mutant 应恰八字段，实际 %s' % sorted(mutant.keys()))
        assert_case(re.match(r'^mutmut-\S+$', mutant['id']) is not None, 'id 应形如 mutmut-<非空白>，实际 %r' % mutant['id'])
        assert_case(isinstance(mutant['file'], str) and mutant['file'], 'file 应为非空字符串')
        assert_case('\\' not in mutant['file'] and not mutant['file'].startswith('./'), 'file 应为 POSIX 相对路径，实际 %r' % mutant['file'])
        assert_case(isinstance(mutant['line'], int) and not isinstance(mutant['line'], bool) and mutant['line'] >= 1, 'line 应为 >=1 整数，实际 %r' % mutant['line'])
        assert_case(isinstance(mutant['column'], int) and not isinstance(mutant['column'], bool) and mutant['column'] >= 1, 'column 应为 >=1 整数，实际 %r' % mutant['column'])
        assert_case(mutant['mutationType'] in MUTATION_TYPE_ENUM, 'mutationType 应在枚举内，实际 %r' % mutant['mutationType'])
        assert_case(isinstance(mutant['original'], str) and mutant['original'], 'original 应为非空字符串')
        assert_case(isinstance(mutant['mutated'], str) and mutant['mutated'], 'mutated 应为非空字符串')
        assert_case(mutant['mutated'] != mutant['original'], 'mutated 应与 original 不同')
        assert_case(mutant['status'] in ('Survived', 'Suspicious'), 'status 应为 Survived/Suspicious，实际 %r' % mutant['status'])
    ids = [m['id'] for m in report['mutants']]
    assert_case(len(set(ids)) == len(ids), 'id 应在报告内唯一')
    assert_case(0 <= report['score'] <= 100, 'score 应在 0-100 内，实际 %r' % report['score'])


def case_json_export_rich(base):
    """JSON 结果导出：仅 survived/suspicious 进入输出（killed 排除）。"""
    dir_path = make_case_dir(base, 'json-export')
    input_path = write_json(dir_path, 'results.json', make_export())
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, '导出 JSON')

    assert_case(len(report['mutants']) == 2, '应提取 2 个变异体，实际 %d' % len(report['mutants']))
    files = [m['file'] for m in report['mutants']]
    assert_case(files == ['src/domain/pricing.py', 'src/services/cart.py'], '输出应按 file 排序且不含 killed 文件，实际 %s' % files)
    statuses = {m['file']: m['status'] for m in report['mutants']}
    assert_case(statuses['src/domain/pricing.py'] == 'Survived', 'pricing 应为 Survived')
    assert_case(statuses['src/services/cart.py'] == 'Suspicious', 'cart 应为 Suspicious')
    first = report['mutants'][0]
    assert_case(first['original'] == '<=' and first['mutated'] == '<', '片段应原样保留，实际 %r→%r' % (first['original'], first['mutated']))
    assert_case(first['mutationType'] == 'ComparisonOperator', '类型应为 ComparisonOperator，实际 %r' % first['mutationType'])
    assert_case(first['column'] == 1, '无行上下文的富条目列号缺省为 1，实际 %r' % first['column'])
    assert_case(report['score'] == 66.67, '分数应为 66.67（4 检出 / 6 总数），实际 %r' % report['score'])


def case_computed_score(base):
    """分数按检出口径从 mutmut 统计计算（Timeout 计入检出）。"""
    dir_path = make_case_dir(base, 'computed-score')
    export = {
        'killed': ['a.py:1', 'a.py:2', 'a.py:3', 'a.py:4'],
        'timeout': ['a.py:5'],
        'suspicious': [{'file': 'a.py', 'line': 6, 'original': 'and', 'mutated': 'or'}],
        'survived': [{'file': 'b.py', 'line': 1, 'original': 'and', 'mutated': 'or'}],
        'skipped': ['a.py:7'],
        'untested': ['a.py:8', 'a.py:9']
    }
    input_path = write_json(dir_path, 'results.json', export)
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, '计算分数')
    assert_case(report['score'] == 50.0, '分数应为 (4 killed + 1 timeout) / 10 总数 * 100 = 50.0，实际 %r' % report['score'])


def case_summary_counts_authoritative(base):
    """回归：节标题计数是分数的权威口径，条目行缺失/截断不改变分数。

    Killed 节报 (9) 但捕获里没有任何 killed 条目行：分数必须按节计数
    9 检出 / 10 总数 = 90.0，而不是按重数条目得出的错误值。
    """
    dir_path = make_case_dir(base, 'summary-authoritative')
    text = '\n'.join([
        'Survived 🙈 (1)',
        'src/domain/pricing.py:4   - Mutation 7',
        'Killed 🔪 (9)',
        'Timeout ⏰ (0)',
        '',
        '--- src/domain/pricing.py',
        '+++ src/domain/pricing.py',
        '@@ -4 +4 @@',
        '-    if total <= 0:',
        '+    if total < 0:',
        ''
    ]) + '\n'
    input_path = write_text(dir_path, 'mutmut_results.txt', text)
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, 'summary-authoritative')
    assert_case(len(report['mutants']) == 1, '输出仍应只有 1 个存活变异体，实际 %d' % len(report['mutants']))
    assert_case(report['mutants'][0]['status'] == 'Survived', '输出变异体应为 Survived，实际 %r' % report['mutants'][0].get('status'))
    assert_case(report['score'] == 90.0, '分数应按节计数 9/10 计为 90.0，实际 %r' % report.get('score'))


def case_score_fallback_without_counts(base):
    """节标题无计数时回退按条目行统计分数（旧口径保持可用）。"""
    dir_path = make_case_dir(base, 'fallback-no-counts')
    text = '\n'.join([
        'Survived',
        'src/domain/pricing.py:4   - Mutation 7',
        'Killed',
        'src/adapters/cli.py:5   - Mutation 1',
        'src/adapters/cli.py:9   - Mutation 2',
        '',
        '--- src/domain/pricing.py',
        '+++ src/domain/pricing.py',
        '@@ -4 +4 @@',
        '-    if total <= 0:',
        '+    if total < 0:',
        ''
    ]) + '\n'
    input_path = write_text(dir_path, 'mutmut_results.txt', text)
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, 'fallback-no-counts')
    assert_case(len(report['mutants']) == 1, '应提取 1 个存活变异体，实际 %d' % len(report['mutants']))
    assert_case(report['score'] == 66.67, '无计数时分数应按条目 2/3 计为 66.67，实际 %r' % report.get('score'))


def case_explicit_score(base):
    """显式分数原样保留；越界分数拒绝。"""
    dir_path = make_case_dir(base, 'explicit-score')
    input_path = write_json(dir_path, 'results.json', make_export(score=87.654321))
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, '显式分数')
    assert_case(report['score'] == 87.654321, '显式分数应原样保留 87.654321，实际 %r' % report['score'])

    dir_path2 = make_case_dir(base, 'explicit-score-out-of-range')
    input_path2 = write_json(dir_path2, 'results.json', make_export(score=150))
    cli = run_cli(['--input', input_path2])
    assert_case(cli['status'] == 1, '越界分数退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('score' in cli['stderr'], 'stderr 应提示分数非法，实际：%s' % cli['stderr'])


def case_entry_with_diff(base):
    """富条目携带 diff 字段时从 diff 提取片段与列号。"""
    dir_path = make_case_dir(base, 'entry-diff')
    diff_text = '\n'.join([
        '--- src/x.py',
        '+++ src/x.py',
        '@@ -10 +10 @@',
        '-    return 1 + 2',
        '+    return 1 - 2',
        ''
    ])
    export = {'survived': [{'file': 'src/x.py', 'line': 10, 'diff': diff_text}]}
    input_path = write_json(dir_path, 'results.json', export)
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, 'entry-diff')
    assert_case(len(report['mutants']) == 1, '应提取 1 个变异体，实际 %d' % len(report['mutants']))
    mutant = report['mutants'][0]
    assert_case(mutant['file'] == 'src/x.py', 'file 应取条目值，实际 %r' % mutant['file'])
    assert_case(mutant['line'] == 10, '行号应为 10，实际 %r' % mutant['line'])
    assert_case(mutant['column'] == 14, '列号应为 14（+ 所在列），实际 %r' % mutant['column'])
    assert_case(mutant['original'] == '+' and mutant['mutated'] == '-', '片段应为 + → -，实际 %r → %r' % (mutant['original'], mutant['mutated']))
    assert_case(mutant['mutationType'] == 'ArithmeticOperator', '类型应为 ArithmeticOperator，实际 %r' % mutant['mutationType'])


def case_string_survivor_rejected(base):
    """survived/suspicious 数组里的纯字符串条目无法提供片段，退出码 1。"""
    dir_path = make_case_dir(base, 'string-survivor')
    export = {'killed': ['a.py:1'], 'survived': ['src/a.py:12']}
    input_path = write_json(dir_path, 'results.json', export)
    cli = run_cli(['--input', input_path])
    assert_case(cli['status'] == 1, '字符串 survivor 退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case(re.search(r'diff|fragment|original', cli['stderr'], re.IGNORECASE) is not None,
                'stderr 应提示需要 diff/片段数据，实际：%s' % cli['stderr'])


def case_unknown_category_rejected(base):
    """未知状态类别（数组值）按契约 §5.3 报错退出 1。"""
    dir_path = make_case_dir(base, 'unknown-category')
    export = {'killed': ['a.py:1'], 'eaten': ['a.py:2']}
    input_path = write_json(dir_path, 'results.json', export)
    cli = run_cli(['--input', input_path])
    assert_case(cli['status'] == 1, '未知类别退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('eaten' in cli['stderr'], 'stderr 应点名未知类别，实际：%s' % cli['stderr'])


def case_results_only_rejected(base):
    """results 节有 survived 条目但无 show diff：退出码 1 并给出指引。"""
    dir_path = make_case_dir(base, 'results-only')
    text = '\n'.join([
        'Survived 🙈 (1)',
        'src/domain/pricing.py:4   - Mutation 7',
        ''
    ]) + '\n'
    input_path = write_text(dir_path, 'results.txt', text)
    cli = run_cli(['--input', input_path])
    assert_case(cli['status'] == 1, '缺 diff 的 survivor 退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case(re.search(r'show|diff', cli['stderr'], re.IGNORECASE) is not None,
                'stderr 应提示补充 mutmut show 输出，实际：%s' % cli['stderr'])


def case_show_only_diffs(base):
    """纯 mutmut show 输出：提取 original/mutated，缺省 Survived，无统计时不写 score。"""
    dir_path = make_case_dir(base, 'show-only')
    text = '\n'.join([
        '--- src/services/cart.py',
        '+++ src/services/cart.py',
        '@@ -23 +23 @@',
        '-    if a and b:',
        '+    if a or b:',
        ''
    ]) + '\n'
    input_path = write_text(dir_path, 'show.txt', text)
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, 'show-only')
    assert_case(len(report['mutants']) == 1, '应提取 1 个变异体，实际 %d' % len(report['mutants']))
    mutant = report['mutants'][0]
    assert_case(mutant['file'] == 'src/services/cart.py', 'file 应来自 diff 头，实际 %r' % mutant['file'])
    assert_case(mutant['line'] == 23, '行号应来自 hunk 头，实际 %r' % mutant['line'])
    assert_case(mutant['column'] == 10, '列号应为 10（and 所在列），实际 %r' % mutant['column'])
    assert_case(mutant['original'] == 'and' and mutant['mutated'] == 'or', '片段应为 and → or，实际 %r → %r' % (mutant['original'], mutant['mutated']))
    assert_case(mutant['status'] == 'Survived', '缺 results 节时状态缺省 Survived，实际 %r' % mutant['status'])
    assert_case('score' not in report, '无运行统计时不应输出 score 字段，实际 %r' % report.get('score'))
    assert_case(set(report.keys()) == {'tool', 'timestamp', 'mutants'}, '顶层应恰为 tool/timestamp/mutants，实际 %s' % sorted(report.keys()))


def case_empty_results(base):
    """零存活输入产出合法空结构（VAL-MUTMUT-006）。"""
    dir_path = make_case_dir(base, 'empty-results')
    text = '\n'.join([
        'Killed 🔪 (2)',
        'src/adapters/cli.py:5   - Mutation 1',
        'src/adapters/cli.py:9   - Mutation 2',
        ''
    ]) + '\n'
    input_path = write_text(dir_path, 'results.txt', text)
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, '空结果-文本')
    assert_case(report['mutants'] == [], 'mutants 应为空数组')
    assert_case(report['score'] == 100, '全部杀死时分数应为 100，实际 %r' % report['score'])

    dir_path2 = make_case_dir(base, 'empty-arrays')
    input_path2 = write_json(dir_path2, 'results.json', {'killed': [], 'survived': []})
    cli = run_cli(['--input', input_path2])
    report = parse_stdout_json(cli, '空结果-JSON')
    assert_case(report['mutants'] == [], '空类别数组应产出空 mutants')
    assert_case(report['score'] == 100, '空范围分数应为 100，实际 %r' % report['score'])


def case_paths_preserved(base):
    """路径归一化只改分隔符与 ./ 前缀，大小写逐字保留（VAL-MUTMUT-007）。"""
    dir_path = make_case_dir(base, 'paths')
    export = {'survived': [
        {'file': '.\\Src\\Domain\\Pricing.py', 'line': 4, 'original': '<=', 'mutated': '<'},
        {'file': './src/a.py', 'line': 1, 'original': 'and', 'mutated': 'or'},
        {'file': 'src\\b.py', 'line': 2, 'original': 'None', 'mutated': 'True'}
    ]}
    input_path = write_json(dir_path, 'results.json', export)
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, '路径保留')
    files = [m['file'] for m in report['mutants']]
    assert_case('Src/Domain/Pricing.py' in files, '反斜杠应转正斜杠且大小写保留，实际 %s' % files)
    assert_case('src/a.py' in files, './ 前缀应去掉，实际 %s' % files)
    assert_case('src/b.py' in files, '反斜杠路径应归一，实际 %s' % files)


def case_output_file(base):
    """--output 落盘：UTF-8 无 BOM、LF、2 空格缩进、单尾换行，stdout 摘要行。"""
    dir_path = make_case_dir(base, 'output-file')
    input_path = write_text(dir_path, 'capture.txt', CAPTURE_TEXT)
    output_path = os.path.join(dir_path, 'unified-mutation-report.json')
    cli = run_cli(['--input', input_path, '--output', output_path])
    assert_case(cli['status'] == 0, '--output 退出码应为 0，实际 %s: %s' % (cli['status'], cli['stderr']))
    assert_case('wrote' in cli['stdout'], 'stdout 应有摘要行，实际：%s' % cli['stdout'])
    assert_case('survived=1' in cli['stdout'], '摘要行应含 survived 计数，实际：%s' % cli['stdout'])
    assert_case(os.path.isfile(output_path), '输出文件应存在')
    with open(output_path, 'rb') as handle:
        raw = handle.read()
    assert_case(not raw.startswith(b'\xef\xbb\xbf'), '输出文件不应带 BOM')
    assert_case(b'\r' not in raw, '输出文件应为 LF 换行')
    assert_case(raw.endswith(b'\n') and not raw.endswith(b'\n\n'), '输出文件应以单个换行结尾')
    report = json.loads(raw.decode('utf-8'))
    assert_case(report['tool'] == 'mutmut', '落盘内容应为统一报告')
    second_line = raw.split(b'\n')[1]
    assert_case(second_line.startswith(b'  "'), '应为 2 空格缩进，实际 %r' % second_line[:6])


def case_multi_line_diff(base):
    """多行变更：original/mutated 以 \\n 连接，坐标指首行首字符。"""
    dir_path = make_case_dir(base, 'multi-line')
    text = '\n'.join([
        '--- src/app.py',
        '+++ src/app.py',
        '@@ -1,7 +1,7 @@',
        ' def run(items):',
        '-    total = 0',
        '-    for item in items:',
        '-        total += 1',
        '+    total = 0',
        '+    for item in items:',
        '+        total += 2',
        '     return total',
        ''
    ]) + '\n'
    input_path = write_text(dir_path, 'show.txt', text)
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, '多行 diff')
    assert_case(len(report['mutants']) == 1, '应提取 1 个变异体，实际 %d' % len(report['mutants']))
    mutant = report['mutants'][0]
    assert_case(mutant['original'] == '    total = 0\n    for item in items:\n        total += 1',
                'original 应按 - 行连接，实际 %r' % mutant['original'])
    assert_case(mutant['mutated'] == '    total = 0\n    for item in items:\n        total += 2',
                'mutated 应按 + 行连接，实际 %r' % mutant['mutated'])
    assert_case(mutant['line'] == 2 and mutant['column'] == 1, '跨行坐标应为首行首字符 2:1，实际 %s:%s' % (mutant['line'], mutant['column']))
    assert_case(mutant['mutationType'] == 'NumberLiteral', '核心差异 1→2 应归为 NumberLiteral，实际 %r' % mutant['mutationType'])


def case_classification_matrix(base):
    """§4.2 归一化映射：逐对 diff 验证 mutationType 与 Unknown 警告。"""
    dir_path = make_case_dir(base, 'classification')
    cases = [
        ('<=', '<', 'ComparisonOperator'),
        ('>=', '>', 'ComparisonOperator'),
        ('==', '!=', 'EqualityOperator'),
        ('is', 'is not', 'EqualityOperator'),
        ('in', 'not in', 'EqualityOperator'),
        ('and', 'or', 'LogicalOperator'),
        ('not x', 'x', 'NegateCondition'),
        ('+', '*', 'ArithmeticOperator'),
        ('//', '%', 'ArithmeticOperator'),
        ('-x', 'x', 'UnaryOperator'),
        ('1', '2', 'NumberLiteral'),
        ("'x'", "'y'", 'StringLiteral'),
        ('break', 'continue', 'BreakContinue'),
        ('None', 'True', 'KeywordLiteral'),
        ('a=1, b=2', 'b=2, a=1', 'KeywordArgument'),
        ('@cached', 'cached_property', 'DecoratorRemoval'),
        ('x = 1', 'pass', 'Block'),
        ('foo', 'bar', 'Unknown')
    ]
    export = {'survived': [{'file': 'src/case%d.py' % index, 'line': index + 1, 'original': old, 'mutated': new}
                           for index, (old, new, _) in enumerate(cases)]}
    input_path = write_json(dir_path, 'results.json', export)
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, '分类矩阵')
    assert_case(len(report['mutants']) == len(cases), '应提取 %d 个变异体，实际 %d' % (len(cases), len(report['mutants'])))
    by_file = {m['file']: m for m in report['mutants']}
    for index, (old, new, expected_type) in enumerate(cases):
        mutant = by_file['src/case%d.py' % index]
        assert_case(mutant['mutationType'] == expected_type,
                    '%r → %r 应为 %s，实际 %s' % (old, new, expected_type, mutant['mutationType']))
    assert_case('Unknown' in cli['stderr'], '无法归类的变异应向 stderr 打警告，实际：%s' % cli['stderr'])


def case_id_ordering(base):
    """id 在排序后从 1 起编号，与输入顺序无关。"""
    dir_path = make_case_dir(base, 'id-ordering')
    text = '\n'.join([
        '--- src/z.py',
        '+++ src/z.py',
        '@@ -9 +9 @@',
        '-    if a and b:',
        '+    if a or b:',
        '',
        '--- src/a.py',
        '+++ src/a.py',
        '@@ -3 +3 @@',
        '-    if x <= 0:',
        '+    if x < 0:',
        ''
    ]) + '\n'
    input_path = write_text(dir_path, 'show.txt', text)
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, 'id 排序')
    assert_case([m['file'] for m in report['mutants']] == ['src/a.py', 'src/z.py'], '应按 file 升序输出')
    assert_case([m['id'] for m in report['mutants']] == ['mutmut-1', 'mutmut-2'], 'id 应排序后从 1 起编号')


def case_cache_valid(base):
    """缓存 + show：状态映射、0 基行号 +1、标记按 id 配对、坐标、片段、分数、--output。"""
    dir_path = make_case_dir(base, 'cache-valid')
    cache_path = write_cache(dir_path, '.mutmut-cache', CACHE_FILES, CACHE_LINES, CACHE_MUTANTS)
    show_path = write_text(dir_path, 'show.txt', SHOW_TEXT)
    cli = run_cli(['--input', cache_path, '--show', show_path])
    report = parse_stdout_json(cli, '缓存有效')

    assert_case(report['tool'] == 'mutmut', "tool 应为 'mutmut'，实际 %r" % report.get('tool'))
    assert_case(TIMESTAMP_RE.match(report['timestamp'] or ''), 'timestamp 应为 ISO-8601 UTC，实际 %r' % report.get('timestamp'))
    assert_case(len(report['mutants']) == 2, '应提取 2 个变异体（1 Survived + 1 Suspicious），实际 %d' % len(report['mutants']))

    first = report['mutants'][0]
    assert_case(first['id'] == 'mutmut-1', '排序后首个 id 应为 mutmut-1，实际 %r' % first.get('id'))
    assert_case(first['file'] == 'src/domain/pricing.py', '路径应保留，实际 %r' % first.get('file'))
    assert_case(first['line'] == 4, '缓存 0 基行号 3 应输出 4，实际 %r' % first.get('line'))
    assert_case(first['column'] == 14, '列号应为 14（<= 所在列），实际 %r' % first.get('column'))
    assert_case(first['mutationType'] == 'ComparisonOperator', '类型应为 ComparisonOperator，实际 %r' % first.get('mutationType'))
    assert_case(first['original'] == '<=' and first['mutated'] == '<', '片段应为 "<="→"<"，实际 %r→%r' % (first.get('original'), first.get('mutated')))
    assert_case(first['status'] == 'Survived', 'bad_survived 应映射为 Survived，实际 %r' % first.get('status'))

    second = report['mutants'][1]
    assert_case(second['id'] == 'mutmut-2', '第二个 id 应为 mutmut-2，实际 %r' % second.get('id'))
    assert_case(second['file'] == 'src/services/cart.py', '第二个路径应为 cart.py，实际 %r' % second.get('file'))
    assert_case(second['line'] == 23 and second['column'] == 10, '坐标应为 23:10，实际 %s:%s' % (second.get('line'), second.get('column')))
    assert_case(second['mutationType'] == 'LogicalOperator', '类型应为 LogicalOperator，实际 %r' % second.get('mutationType'))
    assert_case(second['status'] == 'Suspicious', 'ok_suspicious 应映射为 Suspicious，实际 %r' % second.get('status'))

    assert_case(report['score'] == 60, '分数应为 60（(2 ok_killed + 1 bad_timeout) / 5），实际 %r' % report.get('score'))

    output_path = os.path.join(dir_path, 'unified-mutation-report.json')
    cli2 = run_cli(['--input', cache_path, '--show', show_path, '--output', output_path])
    assert_case(cli2['status'] == 0, '--output 退出码应为 0，实际 %s: %s' % (cli2['status'], cli2['stderr']))
    assert_case('wrote' in cli2['stdout'] and 'survived=1' in cli2['stdout'], 'stdout 应有摘要行，实际：%s' % cli2['stdout'])
    with open(output_path, 'rb') as handle:
        saved = json.loads(handle.read().decode('utf-8'))
    assert_case(saved['tool'] == 'mutmut' and len(saved['mutants']) == 2, '落盘内容应为统一报告')


def case_cache_autodetect_content_based(base):
    """自动识别按内容而非文件名：文本捕获命名为 .mutmut-cache 仍按文本解析。"""
    dir_path = make_case_dir(base, 'cache-autodetect-text')
    input_path = write_text(dir_path, '.mutmut-cache', CAPTURE_TEXT)
    cli = run_cli(['--input', input_path])
    report = parse_stdout_json(cli, '文本命名的缓存')
    assert_case(len(report['mutants']) == 2 and report['score'] == 60,
                '非 SQLite 内容应按文本捕获解析，实际 %d 个变异体/分数 %r' % (len(report['mutants']), report.get('score')))


def case_cache_corrupt_sqlite(base):
    """SQLite 魔数 + 损坏内容：退出码 1，stderr 提示缓存读取失败。"""
    dir_path = make_case_dir(base, 'cache-corrupt')
    input_path = write_text(dir_path, 'corrupt.cache', 'SQLite format 3\x00not a real database body')
    cli = run_cli(['--input', input_path])
    assert_case(cli['status'] == 1, '损坏缓存退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('cache' in cli['stderr'], 'stderr 应提示缓存读取失败，实际：%s' % cli['stderr'])


def case_cache_requires_show(base):
    """缓存有存活者但缺 --show：退出码 1，stderr 指引 --show 并点名缺失 id。"""
    dir_path = make_case_dir(base, 'cache-needs-show')
    cache_path = write_cache(dir_path, '.mutmut-cache', CACHE_FILES, CACHE_LINES, CACHE_MUTANTS)
    cli = run_cli(['--input', cache_path])
    assert_case(cli['status'] == 1, '缺 --show 退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('--show' in cli['stderr'] and 'mutmut show' in cli['stderr'],
                'stderr 应指引 --show 与 mutmut show，实际：%s' % cli['stderr'])
    assert_case('mutant 4' in cli['stderr'], 'stderr 应点名缺失的 mutant id，实际：%s' % cli['stderr'])


def case_cache_missing_diff(base):
    """--show 缺一个存活者的 diff：退出码 1 并给出对应 mutmut show 命令。"""
    dir_path = make_case_dir(base, 'cache-missing-diff')
    cache_path = write_cache(dir_path, '.mutmut-cache', CACHE_FILES, CACHE_LINES, CACHE_MUTANTS)
    show_path = write_text(dir_path, 'show.txt', '\n'.join([
        '# mutant 4',
        '--- src/domain/pricing.py',
        '+++ src/domain/pricing.py',
        '@@ -4 +4 @@',
        '-    if total <= 0:',
        '+    if total < 0:',
        ''
    ]) + '\n')
    cli = run_cli(['--input', cache_path, '--show', show_path])
    assert_case(cli['status'] == 1, '缺 diff 退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('mutant 5' in cli['stderr'] and '"mutmut show 5"' in cli['stderr'],
                'stderr 应点名缺失 id 并给出命令，实际：%s' % cli['stderr'])
    assert_case('src/services/cart.py' in cli['stderr'], 'stderr 应包含缺失位置，实际：%s' % cli['stderr'])


def case_cache_no_survivors(base):
    """无存活缓存不需 --show：空清单 + 分数 100；skipped/untested 状态映射不报错。"""
    dir_path = make_case_dir(base, 'cache-no-survivors')
    files = [('src/a.py', 'hash-a')]
    lines = [('src/a.py', 0, 'x = 1'), ('src/a.py', 4, 'y = 2')]
    mutants = [
        ('src/a.py', 0, 1, 'ok_killed'),
        ('src/a.py', 4, 1, 'bad_timeout'),
        ('src/a.py', 0, 2, 'skipped'),
        ('src/a.py', 4, 2, 'untested'),
    ]
    cache_path = write_cache(dir_path, '.mutmut-cache', files, lines, mutants)
    cli = run_cli(['--input', cache_path])
    report = parse_stdout_json(cli, '缓存无存活')
    assert_case(report['mutants'] == [], 'mutants 应为空数组，实际 %r' % report.get('mutants'))
    assert_case(report['score'] == 50.0,
                '分数应按全缓存计数 (1 killed + 1 timeout) / 4 计为 50.0，实际 %r' % report.get('score'))
    assert_case(cli['stderr'] == '', '无存活时不应有警告，实际：%s' % cli['stderr'])

    dir_path2 = make_case_dir(base, 'cache-all-killed')
    cache_path2 = write_cache(dir_path2, '.mutmut-cache',
                              [('src/b.py', 'hash-b')], [('src/b.py', 0, 'x = 1')],
                              [('src/b.py', 0, 1, 'ok_killed')])
    cli2 = run_cli(['--input', cache_path2])
    report2 = parse_stdout_json(cli2, '缓存全杀死')
    assert_case(report2['mutants'] == [], '全杀死时 mutants 应为空数组')
    assert_case(report2['score'] == 100, '全杀死时分数应为 100，实际 %r' % report2.get('score'))


def case_cache_unknown_status(base):
    """缓存出现未知状态值：按契约 §5.3 退出码 1 并点名状态。"""
    dir_path = make_case_dir(base, 'cache-unknown-status')
    cache_path = write_cache(dir_path, '.mutmut-cache',
                             [('src/a.py', 'hash-a')], [('src/a.py', 0, 'x = 1')],
                             [('src/a.py', 0, 1, 'dead')])
    cli = run_cli(['--input', cache_path])
    assert_case(cli['status'] == 1, '未知状态退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case("'dead'" in cli['stderr'], 'stderr 应点名未知状态值，实际：%s' % cli['stderr'])


def case_cache_not_mutmut(base):
    """普通 SQLite 文件（缺缓存表）：退出码 1 并提示缺表。"""
    dir_path = make_case_dir(base, 'cache-foreign')
    path = os.path.join(dir_path, 'foreign.db')
    conn = sqlite3.connect(path)
    try:
        conn.execute('CREATE TABLE stuff (a INTEGER)')
        conn.commit()
    finally:
        conn.close()
    cli = run_cli(['--input', path])
    assert_case(cli['status'] == 1, '非 mutmut 缓存退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('not a mutmut cache' in cli['stderr'] and 'Line' in cli['stderr'],
                'stderr 应提示缺失的缓存表，实际：%s' % cli['stderr'])


def case_cache_version_mismatch(base):
    """缓存版本异常仍尝试解析：版本 9 打警告；缺版本行不告警。"""
    dir_path = make_case_dir(base, 'cache-version-9')
    cache_path = write_cache(dir_path, '.mutmut-cache', CACHE_FILES, CACHE_LINES, CACHE_MUTANTS, version='9')
    show_path = write_text(dir_path, 'show.txt', SHOW_TEXT)
    cli = run_cli(['--input', cache_path, '--show', show_path])
    report = parse_stdout_json(cli, '版本 9')
    assert_case(len(report['mutants']) == 2, '版本失配仍应解析出 2 个变异体，实际 %d' % len(report['mutants']))
    assert_case('version' in cli['stderr'], 'stderr 应有版本警告，实际：%s' % cli['stderr'])

    dir_path2 = make_case_dir(base, 'cache-no-version')
    cache_path2 = write_cache(dir_path2, '.mutmut-cache', CACHE_FILES, CACHE_LINES, CACHE_MUTANTS, version=None)
    cli2 = run_cli(['--input', cache_path2, '--show', show_path])
    report2 = parse_stdout_json(cli2, '缺版本行')
    assert_case(len(report2['mutants']) == 2, '缺版本行仍应解析，实际 %d' % len(report2['mutants']))
    assert_case(cli2['stderr'] == '', '缺版本行不应告警，实际：%s' % cli2['stderr'])


def case_cache_position_pairing(base):
    """无标记的纯 mutmut show 输出按 file+line 回退配对，全部命中时无警告。"""
    dir_path = make_case_dir(base, 'cache-pos-pairing')
    cache_path = write_cache(dir_path, '.mutmut-cache', CACHE_FILES, CACHE_LINES, CACHE_MUTANTS)
    show_path = write_text(dir_path, 'show.txt', '\n'.join([
        '--- src/domain/pricing.py',
        '+++ src/domain/pricing.py',
        '@@ -4 +4 @@',
        '-    if total <= 0:',
        '+    if total < 0:',
        '',
        '--- src/services/cart.py',
        '+++ src/services/cart.py',
        '@@ -23 +23 @@',
        '-    if a and b:',
        '+    if a or b:',
        ''
    ]) + '\n')
    cli = run_cli(['--input', cache_path, '--show', show_path])
    report = parse_stdout_json(cli, '回退配对')
    assert_case(len(report['mutants']) == 2 and report['score'] == 60,
                '回退配对应提取 2 个变异体且分数 60，实际 %d/%r' % (len(report['mutants']), report.get('score')))
    assert_case(cli['stderr'] == '', '回退配对全部命中时不应有警告，实际：%s' % cli['stderr'])


def case_cache_extra_show_blocks(base):
    """show 里 killed 变异体的多余标记块：告警忽略，输出不受影响。"""
    dir_path = make_case_dir(base, 'cache-extra-blocks')
    cache_path = write_cache(dir_path, '.mutmut-cache', CACHE_FILES, CACHE_LINES, CACHE_MUTANTS)
    show_path = write_text(dir_path, 'show.txt', '\n'.join([
        '# mutant 4',
        '--- src/domain/pricing.py',
        '+++ src/domain/pricing.py',
        '@@ -4 +4 @@',
        '-    if total <= 0:',
        '+    if total < 0:',
        '',
        '# mutant 5',
        '--- src/services/cart.py',
        '+++ src/services/cart.py',
        '@@ -23 +23 @@',
        '-    if a and b:',
        '+    if a or b:',
        '',
        '# mutant 1',
        '--- src/adapters/cli.py',
        '+++ src/adapters/cli.py',
        '@@ -5 +5 @@',
        '-    x = 1',
        '+    x = 2',
        ''
    ]) + '\n')
    cli = run_cli(['--input', cache_path, '--show', show_path])
    report = parse_stdout_json(cli, '多余块')
    assert_case(len(report['mutants']) == 2, '多余 killed 块不应进入输出，实际 %d' % len(report['mutants']))
    assert_case('ignoring' in cli['stderr'] and 'mutant 1' in cli['stderr'],
                '多余 killed 块应告警忽略，实际：%s' % cli['stderr'])


def case_cache_line_mismatch(base):
    """diff hunk 行号与缓存不一致：告警并以缓存坐标（缓存权威）。"""
    dir_path = make_case_dir(base, 'cache-line-mismatch')
    cache_path = write_cache(dir_path, '.mutmut-cache', CACHE_FILES, CACHE_LINES, CACHE_MUTANTS)
    show_path = write_text(dir_path, 'show.txt', '\n'.join([
        '# mutant 4',
        '--- src/domain/pricing.py',
        '+++ src/domain/pricing.py',
        '@@ -9 +9 @@',
        '-    if total <= 0:',
        '+    if total < 0:',
        '',
        '# mutant 5',
        '--- src/services/cart.py',
        '+++ src/services/cart.py',
        '@@ -23 +23 @@',
        '-    if a and b:',
        '+    if a or b:',
        ''
    ]) + '\n')
    cli = run_cli(['--input', cache_path, '--show', show_path])
    report = parse_stdout_json(cli, '行号失配')
    assert_case(cli['status'] == 0, '行号失配退出码应为 0，实际 %s: %s' % (cli['status'], cli['stderr']))
    assert_case(report['mutants'][0]['line'] == 4, '行号应以缓存为准（4），实际 %r' % report['mutants'][0].get('line'))
    assert_case('disagrees' in cli['stderr'], '失配应打警告，实际：%s' % cli['stderr'])


def case_show_flag_with_text_input(base):
    """--show 与非缓存输入同用：退出码 1 并说明旗标只用于缓存。"""
    dir_path = make_case_dir(base, 'show-flag-text')
    input_path = write_text(dir_path, 'capture.txt', CAPTURE_TEXT)
    show_path = write_text(dir_path, 'show.txt', '')
    cli = run_cli(['--input', input_path, '--show', show_path])
    assert_case(cli['status'] == 1, '--show 误用退出码应为 1，实际 %s: %s' % (cli['status'], cli['stdout']))
    assert_case('--show' in cli['stderr'], 'stderr 应点名 --show 误用，实际：%s' % cli['stderr'])


def case_syntax_compat(base):
    """VAL-MUTMUT-012（本机仅 3.14 可用）：源码可编译，无高版本语法。"""
    py_compile.compile(CLI, cfile=os.path.join(base, 'parse_mutmut_report.pyc'), doraise=True)


def main():
    base = tempfile.mkdtemp(prefix='test-parse-mutmut-')
    cases = [
        case_help,
        case_h_alias,
        case_no_input_flag,
        case_unknown_option,
        case_missing_value,
        case_duplicate_option,
        case_input_file_missing,
        case_malformed_json,
        case_format_error,
        case_valid_capture,
        case_schema_strict_shape,
        case_json_export_rich,
        case_computed_score,
        case_summary_counts_authoritative,
        case_score_fallback_without_counts,
        case_explicit_score,
        case_entry_with_diff,
        case_string_survivor_rejected,
        case_unknown_category_rejected,
        case_results_only_rejected,
        case_show_only_diffs,
        case_empty_results,
        case_paths_preserved,
        case_output_file,
        case_multi_line_diff,
        case_classification_matrix,
        case_id_ordering,
        case_cache_valid,
        case_cache_autodetect_content_based,
        case_cache_corrupt_sqlite,
        case_cache_requires_show,
        case_cache_missing_diff,
        case_cache_no_survivors,
        case_cache_unknown_status,
        case_cache_not_mutmut,
        case_cache_version_mismatch,
        case_cache_position_pairing,
        case_cache_extra_show_blocks,
        case_cache_line_mismatch,
        case_show_flag_with_text_input,
        case_syntax_compat
    ]
    try:
        for run_case in cases:
            run_case(base)
    finally:
        shutil.rmtree(base, ignore_errors=True)
    sys.stdout.write('test_parse_mutmut: PASS cases=%d\n' % len(cases))


if __name__ == '__main__':
    try:
        main()
    except AssertionError as err:
        sys.stderr.write('test_parse_mutmut: FAIL %s\n' % err)
        sys.exit(1)
    except Exception as err:  # noqa: BLE001 - 测试入口兜底，保持退出码契约
        sys.stderr.write('test_parse_mutmut: FAIL %s: %s\n' % (type(err).__name__, err))
        sys.exit(1)
