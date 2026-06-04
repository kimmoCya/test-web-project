const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 🛡️ 비관리자 튕겨내기 가드 미들웨어
function isAdmin(req, res, next) {
    const user = req.session.user;
    if (user && user.role === 'ADMIN') {
        next();
    } else {
        res.send('<script>alert("접근 권한이 없습니다! 관리자만 가능합니다."); location.href="/";</script>');
    }
}

router.use(isAdmin);

// 관리자 대시보드 메인
router.get('/', (req, res) => {
    res.render('admin/dashboard', { user: req.session.user });
});

// 👥 1. 회원 관리 목록 조회
router.get('/users', (req, res) => {
    db.all('SELECT id, username, name, email, phone, role FROM users ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('회원 조회 실패');
        res.render('admin/users', { users: rows, user: req.session.user });
    });
});

// 회원 권한 업데이트
router.post('/users/update-role', (req, res) => {
    const { userId, newRole } = req.body;
    db.run('UPDATE users SET role = ? WHERE id = ?', [newRole, userId], (err) => {
        if (err) return res.status(500).send('등급 변경 에러');
        res.send('<script>alert("회원 등급이 성공적으로 업데이트되었습니다."); location.href="/admin/users";</script>');
    });
});

// 회원 강제 탈퇴
router.post('/users/delete', (req, res) => {
    const { userId } = req.body;
    db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
        if (err) return res.status(500).send('회원 추방 에러');
        res.send('<script>alert("해당 회원이 탈퇴 처리되었습니다."); location.href="/admin/users";</script>');
    });
});


// 📦 2. 상품 관리 목록 조회
router.get('/products', (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('상품 조회 에러');
        res.render('admin/products', { products: rows, user: req.session.user });
    });
});

// 🍓 신규 과일 추가 폼 페이지 이동
router.get('/products/new', (req, res) => {
    res.render('admin/products_new', { user: req.session.user });
});

// 💾 신규 과일 등록 처리
router.post('/products/add', (req, res) => {
    const { name, price, emoji, description, image, status } = req.body;
    const query = `INSERT INTO products (name, price, emoji, description, image, status) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(query, [name, price, emoji, description, image || 'default.png', status || '일반'], (err) => {
        if (err) return res.status(500).send('商品 추가 에러');
        res.send('<script>alert("신규 과일 상품이 무사히 진열되었습니다."); location.href="/admin/products";</script>');
    });
});

// ✏️ 상품 수정 폼 페이지 이동
router.get('/products/edit/:id', (req, res) => {
    const productId = req.params.id;
    db.get('SELECT * FROM products WHERE id = ?', [productId], (err, row) => {
        if (err || !row) return res.status(404).send('상품을 찾을 수 없습니다.');
        res.render('admin/products_edit', { product: row, user: req.session.user });
    });
});

// 💾 상품 수정 처리 실행
router.post('/products/edit/:id', (req, res) => {
    const productId = req.params.id;
    const { name, price, emoji, description, image, status } = req.body;
    const query = `UPDATE products SET name = ?, price = ?, emoji = ?, description = ?, image = ?, status = ? WHERE id = ?`;
    db.run(query, [name, price, emoji, description, image || 'default.png', status, productId], (err) => {
        if (err) return res.status(500).send('상품 수정 에러');
        res.send('<script>alert("과일 상품 정보가 성공적으로 수정되었습니다."); location.href="/admin/products";</script>');
    });
});

// 🌟 대장에서 실시간 데이터 상태 변경 수신 API
router.post('/products/update-status', (req, res) => {
    const { id, status } = req.body;
    db.run('UPDATE products SET status = ? WHERE id = ?', [status, id], function(err) {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// ❌ 상품 즉시 삭제 처리
router.post('/products/delete', (req, res) => {
    const { productId } = req.body;
    db.run('DELETE FROM products WHERE id = ?', [productId], (err) => {
        if (err) return res.json({ success: false });
        res.json({ success: true });
    });
});


// ==========================================
// 📜 3. 전체 고객 주문 내역 현황 관리
// 💡 [개인 취향 저격 패치] 배송완료 건은 상황실 목록에서 제외 (숨김)
// ==========================================
router.get('/orders', (req, res) => {
    const query = `
        SELECT o.id AS order_id, o.total_price, o.status, o.created_at, u.name AS user_name, u.username
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.status != '배송완료'
        ORDER BY o.id DESC`;

    db.all(query, (err, rows) => {
        if (err) return res.status(500).send('전체 주문 조회 에러');
        res.render('admin/orders', { orders: rows, user: req.session.user });
    });
});

// 💡 [핵심 추가] 하단 일괄 수정 버튼을 누르면 배열 형태로 수신하여 한 번에 처리하는 API
router.post('/orders/update-batch', (req, res) => {
    let { orderIds, newStatuses } = req.body;

    if (!orderIds || !newStatuses) {
        return res.send('<script>alert("변경할 내역이 존재하지 않습니다."); location.href="/admin/orders";</script>');
    }

    // 데이터가 단 한 건일 경우 Express가 배열이 아닌 단일 문자열로 취급하므로 배열로 예외 방어선 구축
    if (!Array.isArray(orderIds)) orderIds = [orderIds];
    if (!Array.isArray(newStatuses)) newStatuses = [newStatuses];

    db.serialize(() => {
        const stmt = db.prepare('UPDATE orders SET status = ? WHERE id = ?');

        for (let i = 0; i < orderIds.length; i++) {
            stmt.run(newStatuses[i], orderIds[i]);
        }

        stmt.finalize((err) => {
            if (err) {
                console.error('일괄 업데이트 오류:', err);
                return res.status(500).send('배송 상태 일괄 변경 실패');
            }
            res.send('<script>alert("🔒 선택하신 모든 배송 상태가 일괄 수정되었으며, 배송완료 건은 목록에서 지워졌습니다."); location.href="/admin/orders";</script>');
        });
    });
});

module.exports = router;