const express = require('express');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// ==========================================
// 1. 순수 신규 회원가입 (탈퇴 계정 충돌 방지 패치)
// ==========================================
router.get('/register', (req, res) => {
    res.render('register');
});

router.post('/register', async (req, res) => {
    const { username, password, name, birth, address, phone, email } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, existingUser) => {
        if (err) return res.send('<script>alert("DB 오류"); history.back();</script>');

        if (existingUser) {
            // 💡 [버그 패치] 이미 존재하는데 탈퇴한 회원(1)이라면 회원가입이 아니라 재가입(복구)으로 안내합니다.
            if (existingUser.is_withdrawn === 1) {
                return res.send(`
                    <script>
                        alert("과거에 탈퇴하신 계정입니다. 해당 아이디를 복구하시려면 로그인 창에서 기존 비밀번호로 로그인해 주세요.");
                        location.href = "/user/login";
                    </script>
                `);
            }
            // 진짜 사용 중인 유저(0)인 경우에만 중복 차단
            return res.send('<script>alert("이미 존재하는 아이디입니다."); history.back();</script>');
        }

        db.run(
            'INSERT INTO users (username, password, name, birth, address, phone, email, is_withdrawn) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
            [username, hashedPassword, name, birth || null, address || null, phone || null, email || null],
            (insertErr) => {
                if (insertErr) return res.send('<script>alert("가입 실패"); history.back();</script>');
                res.redirect('/user/login');
            }
        );
    });
});

// ==========================================
// 2. 로그인 컨트롤러 (★탈퇴 회원 비밀번호 검증 및 가로채기 방지 완벽 패치)
// ==========================================
router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.send('<script>alert("❌ 존재하지 않는 사용자입니다."); location.href="/user/login";</script>');
        }

        // 💡 중요: 먼저 입력한 비밀번호와 DB의 암호화된 비밀번호가 일치하는지 무조건 인증 절차를 거칩니다.
        const match = await bcrypt.compare(password, user.password);

        if (match) {
            // 💡 비밀번호가 '일치했을 때만' 탈퇴 여부를 검사해야 다른 사람이 계정을 탈취하지 못합니다!
            if (user.is_withdrawn === 1) {
                return res.render('user_rejoin', { username: user.username });
            }

            // 탈퇴 회원이 아닌 정상 활성 회원(0)인 경우 로그인 성공
            req.session.user = user;
            return res.redirect('/');
        } else {
            // 비밀번호 불일치 시 예외 처리
            return res.send('<script>alert("❌ 비밀번호가 일치하지 않습니다. 다시 확인해 주세요."); location.href="/user/login";</script>');
        }
    });
});

// ==========================================
// 3. 로그인창 우회 재가입 비밀번호 확정 및 복구 처리 (History 보존)
// ==========================================
router.post('/rejoin-submit', async (req, res) => {
    const { username, password } = req.body;
    const newHashedPassword = await bcrypt.hash(password, 10);

    // 유저의 고유 id나 기존 정보는 그대로 놔두고 플래그(is_withdrawn = 0)와 비밀번호만 갱신합니다.
    db.run('UPDATE users SET password = ?, is_withdrawn = 0 WHERE username = ?', [newHashedPassword, username], (err) => {
        if (err) {
            console.error('재가입 처리 오류:', err.message);
            return res.send('<script>alert("복구 중 오류가 발생했습니다."); location.href="/user/login";</script>');
        }

        // 복구 직후 브라우저에 바로 로그인이 반영되도록 세션 객체를 다시 주입합니다.
        db.get('SELECT * FROM users WHERE username = ?', [username], (searchErr, refreshedUser) => {
            if (!searchErr && refreshedUser) {
                req.session.user = refreshedUser;
                return res.send('<script>alert("🎉 계정 및 기존 주문 History가 성공적으로 복구되어 자동 로그인되었습니다!"); location.href="/";</script>');
            }
            res.redirect('/user/login');
        });
    });
});

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('❌ 로그아웃 오류:', err);
        res.redirect('/');
    });
});

// ==========================================
// 4. 회원 정보 수정 (Edit Profile)
// ==========================================
router.get('/edit', (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.redirect('/user/login');

    db.get('SELECT * FROM users WHERE username = ? AND is_withdrawn = 0', [sessionUser.username], (err, row) => {
        if (err || !row) return res.send('사용자 정보를 찾을 수 없습니다.');
        res.render('user_edit', { user: row });
    });
});

router.post('/edit', async (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.redirect('/user/login');

    const { name, password, birth, address, phone, email } = req.body;
    const username = sessionUser.username;

    const finalName = (name && name.trim() !== "") ? name : sessionUser.name;
    const finalBirth = (birth && birth.trim() !== "") ? birth : sessionUser.birth;
    const finalAddress = (address && address.trim() !== "") ? address : sessionUser.address;
    const finalPhone = (phone && phone.trim() !== "") ? phone : sessionUser.phone;
    const finalEmail = (email && email.trim() !== "") ? email : sessionUser.email;

    try {
        let sql = '';
        let params = [];

        if (password && password.trim() !== "") {
            const hashedPassword = await bcrypt.hash(password, 10);
            sql = `UPDATE users SET name=?, password=?, birth=?, address=?, phone=?, email=? WHERE username=? AND is_withdrawn=0`;
            params = [finalName, hashedPassword, finalBirth, finalAddress, finalPhone, finalEmail, username];
        } else {
            sql = `UPDATE users SET name=?, birth=?, address=?, phone=?, email=? WHERE username=? AND is_withdrawn=0`;
            params = [finalName, finalBirth, finalAddress, finalPhone, finalEmail, username];
        }

        db.run(sql, params, function (err) {
            if (err) {
                console.error('❌ 회원정보 수정 DB 오류:', err.message);
                return res.send('<script>alert("수정 실패"); history.back();</script>');
            }

            req.session.user.name = finalName;
            req.session.user.birth = finalBirth;
            req.session.user.address = finalAddress;
            req.session.user.phone = finalPhone;
            req.session.user.email = finalEmail;

            req.session.save(() => {
                res.send('<script>alert("회원 정보가 성공적으로 수정되었습니다."); location.href="/mypage";</script>');
            });
        });
    } catch (error) {
        console.error(error);
        res.send('서버 오류 발생');
    }
});

// ==========================================
// 5. 회원 탈퇴 처리 라우터
// ==========================================
router.post('/withdraw-submit', (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.status(401).send('로그인이 필요합니다.');

    db.run('UPDATE users SET is_withdrawn = 1 WHERE username = ?', [sessionUser.username], (err) => {
        if (err) {
            console.error('❌ 탈퇴 처리 중 DB 오류:', err.message);
            return res.send('<script>alert("탈퇴 처리 중 오류가 발생했습니다."); history.back();</script>');
        }

        req.session.destroy((sessionErr) => {
            if (sessionErr) console.error('세션 파기 오류:', sessionErr);
            res.send('<script>alert("회원 탈퇴가 정상적으로 완료되었습니다. 그동안 이용해 주셔서 감사합니다."); location.href="/";</script>');
        });
    });
});

module.exports = router;