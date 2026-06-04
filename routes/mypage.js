const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// GET /mypage
router.get('/', (req, res) => {
    const sessionUser = req.session.user;

    if (!sessionUser) {
        return res.redirect('/user/login');
    }

    // 탈퇴하지 않은 정상 유저인지 체크하며 조회
    db.get('SELECT * FROM users WHERE username = ? AND is_withdrawn = 0', [sessionUser.username], (err, user) => {
        if (err || !user) {
            console.error('마이페이지 조회 오류:', err);
            return res.send('<script>alert("사용자 정보를 불러올 수 없거나 탈퇴된 계정입니다."); location.href="/";</script>');
        }

        res.render('mypage', { user: user });
    });
});

// 💡 [추가] POST /mypage/withdraw (회원 탈퇴 처리)
router.post('/withdraw', (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.status(401).send('로그인이 필요합니다.');

    // 완전히 DELETE 하지 않고, 기억하기 위해 탈퇴 상태(is_withdrawn = 1)만 변경합니다.
    db.run('UPDATE users SET is_withdrawn = 1 WHERE username = ?', [sessionUser.username], (err) => {
        if (err) {
            console.error('❌ 탈퇴 처리 중 DB 오류:', err.message);
            return res.send('<script>alert("탈퇴 처리 중 오류가 발생했습니다."); history.back();</script>');
        }

        // 탈퇴 처리 완료 후 현재 로그인된 브라우저 세션 정보 파괴
        req.session.destroy((sessionErr) => {
            if (sessionErr) console.error('세션 파기 오류:', sessionErr);
            res.send('<script>alert("회원 탈퇴가 정상적으로 완료되었습니다. 그동안 이용해 주셔서 감사합니다."); location.href="/";</script>');
        });
    });
});

module.exports = router;