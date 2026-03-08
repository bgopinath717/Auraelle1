from flask import Flask, request, jsonify, render_template, redirect, url_for
import json
import os
from werkzeug.utils import secure_filename
import time

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join('static', 'images')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
PRODUCTS_FILE = 'products.json'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def load_products():
    if not os.path.exists(PRODUCTS_FILE):
        return []
    with open(PRODUCTS_FILE, 'r') as f:
        return json.load(f)

def save_products(products):
    with open(PRODUCTS_FILE, 'w') as f:
        json.dump(products, f, indent=2)

@app.route('/')
def index():
    products = load_products()
    return render_template('index.html', products=products)

@app.route('/admin')
def admin():
    products = load_products()
    return render_template('admin.html', products=products)

@app.route('/upload', methods=['POST'])
def upload():
    if 'image' not in request.files:
        return redirect(url_for('admin'))
    file = request.files['image']
    price = request.form.get('price', '')
    category = request.form.get('category', '')
    if file.filename == '':
        return redirect(url_for('admin'))
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Make filename unique
        base, ext = os.path.splitext(filename)
        filename = f"{base}_{int(time.time())}{ext}"
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        products = load_products()
        products.append({
            "image": filename,
            "price": price,
            "category": category
        })
        save_products(products)
    return redirect(url_for('admin'))

@app.route('/delete/<int:index>', methods=['POST'])
def delete_product(index):
    products = load_products()
    if 0 <= index < len(products):
        product = products[index]
        img_path = os.path.join(app.config['UPLOAD_FOLDER'], product['image'])
        if os.path.exists(img_path):
            os.remove(img_path)
        products.pop(index)
        save_products(products)
    return redirect(url_for('admin'))

@app.route('/api/products')
def api_products():
    return jsonify(load_products())

if __name__ == '__main__':
    if not os.path.exists(PRODUCTS_FILE):
        save_products([])
    app.run(host='0.0.0.0', port=5000, debug=True)
