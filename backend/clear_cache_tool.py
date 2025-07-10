# clear_cache.py - 改进版 ✅
# 清理 HuggingFace/Torch 缓存 + 项目临时文件（打印路径 + 确保删除）

import os
import shutil

from pathlib import Path
user_dir = Path.home()
hf_cache = user_dir / ".cache" / "huggingface"
torch_cache = user_dir / ".cache" / "torch"
nltk_cache = user_dir / "AppData" / "Roaming" / "nltk_data"
temp_dir = Path("temp")

# 删除文件夹

def remove_dir(path):
    path = Path(path)
    if path.exists():
        try:
            shutil.rmtree(path)
            print(f"✅ 已清除文件夹: {path}")
        except Exception as e:
            print(f"⚠️ 删除失败: {path} - {e}")
    else:
        print(f"🔍 文件夹不存在: {path}")

# 删除指定后缀文件

def remove_files_by_ext(folder, extensions):
    folder = Path(folder)
    if not folder.exists():
        return
    for file in folder.glob("**/*"):
        if file.is_file() and file.suffix in extensions:
            try:
                size = file.stat().st_size // (1024 * 1024)
                file.unlink()
                print(f"🗑️ 删除 {file} ({size}MB)")
            except Exception as e:
                print(f"⚠️ 删除失败: {file} - {e}")

# ========== 执行清理 ==========
print("\n🚀 正在清理缓存和临时资源...")
print(f"🧭 HuggingFace 缓存路径: {hf_cache}")
print(f"🧭 Torch 缓存路径:       {torch_cache}")

# 清理模型缓存
remove_files_by_ext(hf_cache, [".bin", ".safetensors"])
remove_files_by_ext(torch_cache, [".pt", ".bin"])

# 清理 temp 目录的帧图像和视频
remove_files_by_ext(temp_dir, [".jpg", ".png", ".mp4", ".avi", ".wav", ".mp3"])

# 清理 temp/frames_xxx 文件夹
if temp_dir.exists():
    for sub in temp_dir.iterdir():
        if sub.is_dir() and sub.name.startswith("frames_"):
            remove_dir(sub)

print("\n✅ 清理完成，可关闭窗口或重启服务。")