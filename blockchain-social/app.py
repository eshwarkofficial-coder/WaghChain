
from flask import Flask, render_template, send_from_directory
import os

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

# Optional: serve the generated contract.json
@app.route('/contract.json')
def contract_json():
    return send_from_directory('static', 'contract.json', mimetype='application/json')

if __name__ == '__main__':
    app.run(debug=True)
