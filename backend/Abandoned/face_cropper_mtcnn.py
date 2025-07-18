import os
from PIL import Image
from facenet_pytorch import MTCNN

def crop_faces_mtcnn(input_folder='extracted_frames', output_folder='cropped_faces'):
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    mtcnn = MTCNN(keep_all=True, device='cpu')  # 如果你没有GPU，就用 CPU

    count = 0
    for filename in os.listdir(input_folder):
        if filename.endswith(".jpg"):
            img_path = os.path.join(input_folder, filename)
            img = Image.open(img_path).convert('RGB')

            boxes, _ = mtcnn.detect(img)

            if boxes is not None:
                for i, box in enumerate(boxes):
                    x1, y1, x2, y2 = [int(b) for b in box]
                    face = img.crop((x1, y1, x2, y2))
                    face.save(os.path.join(output_folder, f"{filename[:-4]}_face{i}.jpg"))
                    count += 1

    print(f"✅ 成功裁剪 {count} 张人脸图像。")

if __name__ == "__main__":
    crop_faces_mtcnn()
