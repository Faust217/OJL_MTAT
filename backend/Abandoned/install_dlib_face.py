import os

# 下载 wheel 文件
os.system("curl -L -o dlib.whl https://download.lfd.uci.edu/pythonlibs/archived/dlib-19.24.2-cp310-cp310-win_amd64.whl")
os.system("curl -L -o face_recognition.whl https://download.lfd.uci.edu/pythonlibs/archived/face_recognition-1.3.0-cp310-cp310-win_amd64.whl")

# 安装 wheel 文件
os.system("pip install dlib.whl")
os.system("pip install face_recognition.whl")

print("✅ 安装完成，请运行 python -c \"import face_recognition; print('OK')\" 检查是否成功")
