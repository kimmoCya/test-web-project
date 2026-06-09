const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.sqlite');

// 위시리스트 추가 (POST /wishlist/add)
router.post('/add', (req, res) => {
    const user = req.session.user;
    const { productId } = req.body;

    if (!user) {
        return res.send('<script>alert("위시리스트를 사용하려면 로그인이 필요합니다."); location.href="/user/login";</script>');
    }

    const query = `INSERT OR IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)`;
    db.run(query, [user.id, productId], (err) => {
        if (err) return res.status(500).send('위시리스트 추가 실패');
        res.send('<script>alert("위시리스트에 상품을 담았습니다! ❤️"); history.back();</script>');
    });
});

// 위시리스트 목록 조회 (GET /wishlist)
router.get('/', (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/user/login');

    const query = `
        SELECT w.id AS wish_id, p.id, p.name, p.price, p.emoji, p.image 
        FROM wishlist w
        JOIN products p ON w.product_id = p.id
        WHERE w.user_id = ?
        ORDER BY w.created_at DESC`;

    db.all(query, [user.id], (err, rows) => {
        if (err) return res.status(500).send('위시리스트 조회 실패');
        res.render('wishlist', { wishlistItems: rows, user });
    });
});

// 위시리스트 항목 삭제 (POST /wishlist/delete)
router.post('/delete', (req, res) => {
    const user = req.session.user;
    const { productId } = req.body;

    if (!user) return res.redirect('/user/login');

    db.run(`DELETE FROM wishlist WHERE user_id = ? AND product_id = ?`, [user.id, productId], (err) => {
        if (err) return res.status(500).send('위시리스트 삭제 실패');
        res.redirect('/wishlist');
    });
});

module.exports = router;