const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.sqlite');

router.get('/', (req, res) => {
    db.all("SELECT * FROM products WHERE status = '메인 추천 노출중' ORDER BY RANDOM() LIMIT 6", (err, featuredProducts) => {
        if (err) {
            return res.status(500).send('추천 상품 불러오기 실패');
        }
        res.render('index', {
            title: '내 쇼핑몰',
            featuredProducts,
            user: req.session.user
        });
    });
});

module.exports = router;