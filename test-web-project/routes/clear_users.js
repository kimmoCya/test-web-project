const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('🔄 잘못된 유저 테이블 구조 완전 삭제 시작...');

    // 💡 데이터뿐만 아니라 테이블 자체를 날려버려서 app.js가 새로 만들 수 있게 합니다.
    db.run('DROP TABLE IF EXISTS users', function(err) {
        if (err) {
            console.error('❌ 유저 테이블 삭제 실패:', err.message);
        } else {
            console.log('✅ 상품 데이터는 유지한 채, 잘못된 유저 테이블 구조를 완벽히 제거했습니다.');
        }
        db.close();
    });
});