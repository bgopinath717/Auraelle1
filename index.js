require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const nunjucks = require('nunjucks');
const { neon } = require('@neondatabase/serverless');
const { put, del } = require('@vercel/blob');

const app = express();
const PORT = process.env.PORT || 5000;
const sql = neon(process.env.DATABASE_URL || 'postgresql://user:pass@host/db');

app.use(cors());
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Set up Nunjucks (Jinja2 compatible)
nunjucks.configure(path.join(__dirname, 'templates'), {
    autoescape: true,
    express: app,
    watch: false
});

app.set('view engine', 'html');

// Multer storage configuration - using MemoryStorage for Vercel Blob
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 16 * 1024 * 1024 }, // 16MB limit
    fileFilter: function (req, file, cb) {
        const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PNG, JPG, JPEG, GIF, and WEBP are allowed.'));
        }
    }
});

// Initialize database table if it doesn't exist
async function initDb() {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                image_url TEXT NOT NULL,
                price VARCHAR(50) NOT NULL,
                category VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log("Database initialized successfully");
    } catch (error) {
        console.error("Database initialization failed. Check your Vercel Postgres credentials.", error);
    }
}

// Routes
app.get('/', async (req, res) => {
    try {
        const rows = await sql`SELECT * FROM products ORDER BY id DESC;`;
        res.render('index.html', { products: rows });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.render('index.html', { products: [] });
    }
});

app.get('/admin', async (req, res) => {
    try {
        const rows = await sql`SELECT * FROM products ORDER BY id DESC;`;
        res.render('admin.html', { products: rows });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.render('admin.html', { products: [] });
    }
});

app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.redirect('/admin');
    }

    const price = req.body.price || '';
    const category = req.body.category || '';
    
    try {
        // Upload image to Vercel Blob from memory buffer
        const filename = `products/${Date.now()}_${req.file.originalname}`;
        const blob = await put(filename, req.file.buffer, {
            access: 'public',
        });

        // Save product details to Vercel Postgres
        await sql`
            INSERT INTO products (image_url, price, category)
            VALUES (${blob.url}, ${price}, ${category});
        `;
        
    } catch (error) {
        console.error("Failed to upload image or save to database:", error);
    }

    res.redirect('/admin');
});

app.post('/delete/:id', async (req, res) => {
    const id = req.params.id;
    
    try {
        // Find the product first to get the image URL so we can delete the blob
        const rows = await sql`SELECT image_url FROM products WHERE id = ${id};`;
        
        if (rows.length > 0) {
            const imageUrl = rows[0].image_url;
            
            // Delete image from Vercel Blob
            if (imageUrl) {
                await del(imageUrl);
            }
            
            // Delete product from Postgres
            await sql`DELETE FROM products WHERE id = ${id};`;
        }
    } catch (error) {
        console.error("Deletion failed:", error);
    }
    
    res.redirect('/admin');
});

app.get('/api/products', async (req, res) => {
    try {
        const rows = await sql`SELECT * FROM products ORDER BY id DESC;`;
        res.json(rows);
    } catch (error) {
        console.error("Error fetching products API:", error);
        res.status(500).json({ error: "Failed to fetch products" });
    }
});

app.use((err, req, res, next) => {
    if (err) {
        console.error("Express Error:", err);
        return res.status(500).send("An error occurred. Check Vercel logs.");
    }
    next();
});

// Run Init DB
initDb();

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
