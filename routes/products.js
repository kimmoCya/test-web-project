const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.sqlite');

// 전체 상품 목록 + 💡 [수정] 관리자 지정 추천 상태 반영
router.get('/', (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, allProducts) => {
        if (err) return res.status(500).send('DB 오류: 전체 상품 조회 실패');

        // 💡 [핵심 교정] 기존의 'is_featured = 1'을 버리고, 관리대장의 'status' 컬럼과 정밀 연동합니다!
        const queryFeatured = `SELECT * FROM products WHERE status = '메인 추천 노출중' ORDER BY id DESC LIMIT 4`;

        db.all(queryFeatured, (err2, featuredProducts) => {
            if (err2) return res.status(500).send('DB 오류: 추천 상품 조회 실패');

            res.render('products', {
                allProducts: allProducts,
                featuredProducts: featuredProducts,
                user: req.session.user
            });
        });
    });
});

// ✅ 전체 상품 목록만 보여주는 페이지
router.get('/all', (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('전체 상품 목록 불러오기 실패');

        res.render('products_all', {
            products: rows,
            user: req.session.user
        });
    });
});

module.exports = router;