
from flask import Flask, render_template, send_from_directory
import os

app = Flask(__name__)

@app.route('/')
def start():
    return render_template('start.html')

@app.route('/index.html')
def index():
    return render_template('index.html')


@app.route('/contract.json')
def contract_json():
    return send_from_directory('static', 'contract.json', mimetype='application/json')

if __name__ == '__main__':
    
    app.run(host='0.0.0.0', port=5000, debug=True)
