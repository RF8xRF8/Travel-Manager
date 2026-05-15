#!/usr/bin/env python3
"""
创建过期签证进行测试
"""
import sqlite3
from datetime import date, timedelta

DB_PATH = "data.db"

def create_test_visas():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    today = date.today()
    yesterday = (today - timedelta(days=1)).isoformat()
    today_str = today.isoformat()
    tomorrow = (today + timedelta(days=1)).isoformat()
    
    print("创建测试签证:")
    print("-" * 60)
    
    # 测试1: 昨天过期、状态为active的签证
    cur = conn.execute(
        """INSERT INTO visas (country, country_code, valid_from, valid_to, total_entries, used_entries, visa_type, status, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        ("测试国1", "T1", "2026-05-01", yesterday, 2, 0, "单次", "active", "昨天过期的active签证")
    )
    visa_id_1 = cur.lastrowid
    print(f"✓ 创建ID {visa_id_1}: 有效期至 {yesterday} (已过期) | 状态: active")
    
    # 测试2: 今天过期、状态为active的签证
    cur = conn.execute(
        """INSERT INTO visas (country, country_code, valid_from, valid_to, total_entries, used_entries, visa_type, status, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        ("测试国2", "T2", "2026-05-01", today_str, 2, 0, "双次", "active", "今天过期的active签证")
    )
    visa_id_2 = cur.lastrowid
    print(f"✓ 创建ID {visa_id_2}: 有效期至 {today_str} (今天) | 状态: active")
    
    # 测试3: 明天过期、状态为active的签证（不应该过期）
    cur = conn.execute(
        """INSERT INTO visas (country, country_code, valid_from, valid_to, total_entries, used_entries, visa_type, status, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        ("测试国3", "T3", "2026-05-01", tomorrow, 2, 0, "多次", "active", "明天过期的签证")
    )
    visa_id_3 = cur.lastrowid
    print(f"✓ 创建ID {visa_id_3}: 有效期至 {tomorrow} (明天) | 状态: active")
    
    # 测试4: 昨天过期、状态为pending的签证（不应该被auto_expire）
    cur = conn.execute(
        """INSERT INTO visas (country, country_code, valid_from, valid_to, total_entries, used_entries, visa_type, status, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        ("测试国4", "T4", "2026-05-01", yesterday, 1, 0, "单次", "pending", "昨天过期但状态为pending的签证")
    )
    visa_id_4 = cur.lastrowid
    print(f"✓ 创建ID {visa_id_4}: 有效期至 {yesterday} (已过期) | 状态: pending")
    
    conn.commit()
    conn.close()
    
    print("\n测试签证已创建。现在调用 auto_expire_expired_visas() 来测试自动过期功能...")
    print("-" * 60)
    
    # 现在连接并测试 auto_expire
    import sys
    sys.path.insert(0, '.')
    from app import get_db, auto_expire_expired_visas
    
    with get_db() as conn:
        auto_expire_expired_visas(conn)
    
    # 查询结果
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    print("\nauto_expire_expired_visas() 执行后的签证状态:")
    print("-" * 60)
    test_visas = conn.execute(
        "SELECT * FROM visas WHERE country LIKE '测试%' ORDER BY id"
    ).fetchall()
    
    for v in test_visas:
        print(f"ID {v['id']}: {v['country']:6} | 有效期: {v['valid_to']} | 状态: {v['status']:8} | 使用: {v['used_entries']}/{v['total_entries']}")
    
    # 查看历史记录
    print("\n签证状态变化历史:")
    print("-" * 60)
    history = conn.execute(
        "SELECT * FROM visa_status_history WHERE visa_id IN (SELECT id FROM visas WHERE country LIKE '测试%') ORDER BY changed_at DESC"
    ).fetchall()
    
    for h in history:
        old_status = h['old_status'] or '---'
        print(f"签证 {h['visa_id']:2} | {old_status:8} → {h['new_status']:8} | {h['reason']}")
    
    conn.close()

if __name__ == "__main__":
    create_test_visas()
