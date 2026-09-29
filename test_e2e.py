import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "python_app"))

from agents import brain, intent_parser, tools, contacts
import settings

print("==========================================")
print("     VERIFYING REQUESTED CAPABILITIES     ")
print("==========================================")

# 1. Google Search
queries = [
    'do search "quantum computing"',
    'search python tutorial',
    'google machine learning',
]
for q in queries:
    res = intent_parser.parse_intent(q)
    print(f"'{q}' => action: {res['action']}, query: {res['params'].get('query')}")
    assert res['action'] == 'google_search', f"Failed for {q}"

print("=> PASS: Google Search intent matching is working perfectly!")

# 2. YouTube
yt_phrases = ['open youtube', 'open you', 'open yt']
for phrase in yt_phrases:
    res = intent_parser.parse_intent(phrase)
    print(f"'{phrase}' => action: {res['action']}")
    assert res['action'] == 'open_youtube', f"Failed for {phrase}"

print("=> PASS: 'open you' and 'open youtube' matching is working perfectly!")

# 3. GitHub
gh_res = intent_parser.parse_intent("check github")
print(f"'check github' => action: {gh_res['action']}")
assert gh_res['action'] == 'check_github'
print("=> PASS: GitHub checks are on-demand!")

# 4. Chat
chat_res = brain.ask_vishal("hi")
print(f"Chat test reply: {chat_res.get('response')} (source: {chat_res.get('source')})")
assert chat_res.get("success") is True

print("==========================================")
print("     ALL REQUESTED CHECKS PASSED!         ")
print("==========================================")
