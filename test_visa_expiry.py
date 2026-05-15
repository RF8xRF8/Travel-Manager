#!/usr/bin/env python3
"""
测试签证过期失效功能
"""
import sqlite3
from datetime import date, timedelta

DB_PATH = "data.db"

def test_visa_expiry():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    print("=" * 60)
    print("测试签证过期失效功能")
    print("=" * 60)
    
    # 查询所有签证
    visas = conn.execute("SELECT * FROM visas").fetchall()
    print(f"\n总签证数: {len(visas)}")
    
    print("\n现有签证列表:")
    print("-" * 60)
    today = date.today().isoformat()
    
    for v in visas:
        visa_id = v["id"]
        country = v["country"]
        valid_to = v["valid_to"]
        status = v["status"]
        total = v["total_entries"]
        used = v["used_entries"]
        
        # 计算过期判断
        if valid_to:
            days_left = (valid_to < today)  # True if expired
            days_str = f"已过期" if days_left else f"有效至 {valid_to}"
        else:
            days_str = "无期限"
        
        print(f"ID {visa_id}: {country:6} | {days_str:12} | 状态: {status:8} | 使用: {used}/{total}")
    
    # 统计过期签证
    print("\n过期签证统计:")
    print("-" * 60)
    
    expired_check = conn.execute(
        "SELECT * FROM visas WHERE valid_to IS NOT NULL AND valid_to < ? AND status='active'",
        (today,)
    ).fetchall()
    
    print(f"应该被自动标记为过期的签证（valid_to < 今天且状态为active）: {len(expired_check)}")
    for v in expired_check:
        print(f"  - ID {v['id']}: {v['country']} (有效期至 {v['valid_to']}，当前状态: {v['status']})")
    
    # 查看有效期当天的签证
    print(f"\n今天（{today}）过期的签证:")
    print("-" * 60)
    today_expiry = conn.execute(
        "SELECT * FROM visas WHERE valid_to = ?",
        (today,)
    ).fetchall()
    print(f"有效期 = {today} 的签证: {len(today_expiry)}")
    for v in today_expiry:
        print(f"  - ID {v['id']}: {v['country']}, 状态: {v['status']}, 使用: {v['used_entries']}/{v['total_entries']}")
    
    # 查看昨天过期的签证
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    print(f"\n昨天（{yesterday}）过期的签证:")
    print("-" * 60)
    yesterday_expiry = conn.execute(
        "SELECT * FROM visas WHERE valid_to = ?",
        (yesterday,)
    ).fetchall()
    print(f"有效期 = {yesterday} 的签证: {len(yesterday_expiry)}")
    for v in yesterday_expiry:
        print(f"  - ID {v['id']}: {v['country']}, 状态: {v['status']}, 使用: {v['used_entries']}/{v['total_entries']}")
    
    # 查看签证状态变化历史
    print(f"\n签证状态变化历史 (最近10条):")
    print("-" * 60)
    history = conn.execute(
        "SELECT * FROM visa_status_history ORDER BY changed_at DESC LIMIT 10"
    ).fetchall()
    for h in history:
        old_status = h['old_status'] or '---'
        print(f"{h['changed_at']:20} | 签证 {h['visa_id']:2} | {old_status:8} → {h['new_status']:8} | {h['reason']}")
    
    conn.close()
    print("\n" + "=" * 60)

if __name__ == "__main__":
    test_visa_expiry()
