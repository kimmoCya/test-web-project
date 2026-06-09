const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.sqlite');

// ==========================================
// 💡 [최신순 정렬 완벽 보장] GET /order/history
// 마이페이지에서 "나의 주문 내역 확인"을 누르면 무조건 최신 주문이 맨 위로 올라옵니다!
// ==========================================
router.get('/history', (req, res) => {
    const sessionUser = req.session.user;

    if (!sessionUser) {
        return res.send('<script>alert("로그인이 필요합니다."); location.href="/user/login";</script>');
    }

    const query = `
        SELECT 
            o.id AS orderId,
            o.total_price AS totalPrice,
            o.status,
            o.created_at AS createdAt,
            oi.quantity,
            oi.price,
            p.name,
            p.emoji
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        JOIN products p ON oi.product_id = p.id
        WHERE o.user_id = ?
    `;

    db.all(query, [sessionUser.id], (err, rows) => {
        if (err) {
            console.error('❌ 주문 결제 내역 조회 오류:', err.message);
            return res.status(500).send('주문 내역 조회 에러');
        }

        // 1. 주문번호(orderId) 기준으로 그룹화 묶기 (이 단계에서 객체 특성상 오름차순으로 순서가 바뀜)
        const orderGroups = {};
        rows.forEach(row => {
            if (!orderGroups[row.orderId]) {
                orderGroups[row.orderId] = {
                    orderId: row.orderId,
                    totalPrice: row.totalPrice,
                    status: row.status,
                    createdAt: row.createdAt,
                    items: []
                };
            }
            orderGroups[row.orderId].items.push({
                name: row.name,
                emoji: row.emoji,
                quantity: row.quantity,
                price: row.price
            });
        });

        // 2. 객체를 배열로 변환
        let ordersArray = Object.values(orderGroups);

        // 💡 [게시판 연동 매커니즘 핵심 코드]
        // 변환된 배열을 주문번호(orderId)가 가장 큰 최신순(내림차순)으로 확실하게 재정렬합니다!
        ordersArray.sort((a, b) => b.orderId - a.orderId);

        // 3. 최신순 정렬이 끝난 완벽한 데이터를 views/order_history.ejs 뷰로 전송
        res.render('order_history.ejs', {
            orders: ordersArray
        });
    });
});

// ==========================================
// 🛒 장바구니에서 [주문 및 안전 결제하기]를 눌렀을 때 라우팅
// ==========================================
router.post('/confirm', (req, res) => {
    const user = req.session.user;

    if (!user) {
        return res.send('<script>alert("로그인이 필요합니다."); location.href="/user/login";</script>');
    }

    const query = `
        SELECT p.id AS product_id, p.name, p.price, p.emoji, p.image, c.quantity
        FROM cart_items c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = ?`;

    db.all(query, [user.id], (err, cartRows) => {
        if (err || !cartRows || cartRows.length === 0) {
            return res.send('<script>alert("🛒 장바구니가 비어 있거나 상품 정보 조회에 실패하여 주문을 진행할 수 없습니다."); location.href="/cart";</script>');
        }

        const orderItems = cartRows.map(row => {
            return {
                product_id: row.product_id,
                name: row.name,
                price: row.price,
                emoji: row.emoji,
                quantity: row.quantity,
                total: row.price * row.quantity
            };
        });

        const totalPrice = orderItems.reduce((sum, item) => sum + item.total, 0);

        res.render('order_form.ejs', {
            user,
            orderItems,
            totalPrice
        });
    });
});

// ==========================================
// 💳 결제창(order_form.ejs)에서 최종 [안전 결제하기] 처리
// ==========================================
router.post('/checkout', (req, res) => {
    const user = req.session.user;

    if (!user) return res.status(401).send('로그인이 필요합니다.');

    const query = `
        SELECT p.id AS product_id, p.price, c.quantity
        FROM cart_items c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = ?`;

    db.all(query, [user.id], (err, cartRows) => {
        if (err || !cartRows || cartRows.length === 0) {
            return res.send('<script>alert("주문할 상품이 존재하지 않습니다."); location.href="/cart";</script>');
        }

        let totalPrice = 0;
        cartRows.forEach(row => {
            totalPrice += row.price * row.quantity;
        });

        db.serialize(() => {
            db.run('INSERT INTO orders (user_id, total_price, status) VALUES (?, ?, ?)', [user.id, totalPrice, '배송준비중'], function(err1) {
                if (err1) return res.status(500).send('주문 처리 실패');

                const orderId = this.lastID;
                const stmt = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
                cartRows.forEach(row => {
                    stmt.run(orderId, row.product_id, row.quantity, row.price);
                });

                stmt.finalize((err2) => {
                    if (err2) return res.status(500).send('상세 품목 저장 실패');

                    db.run('DELETE FROM cart_items WHERE user_id = ?', [user.id], (err3) => {
                        if (err3) console.error('장바구니 비우기 오류:', err3.message);
                        res.send('<script>alert("💚 과일 주문 및 결제가 완료되었습니다!"); location.href="/mypage";</script>');
                    });
                });
            });
        });
    });
});

module.exports = router;