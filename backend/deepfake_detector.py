import torch
from torchvision import transforms
from PIL import Image
import timm
import cv2
import face_recognition
import numpy as np

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

model_path = "model/xception_deepfake_final.pt"
model = timm.create_model('xception', pretrained=False, num_classes=2)
model.load_state_dict(torch.load(model_path, map_location=device))
model.eval().to(device)

transform = transforms.Compose([
    transforms.Resize((299, 299)),
    transforms.ToTensor(),
    transforms.Normalize([0.5] * 3, [0.5] * 3)
])

def predict_image(image_path):
    image_cv = cv2.imread(image_path)
    face_locations = face_recognition.face_locations(image_cv)

    if face_locations:
        top, right, bottom, left = face_locations[0]
        face_img = image_cv[top:bottom, left:right]
        face_img = cv2.resize(face_img, (299, 299))
        face_img = cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB)
        image_pil = Image.fromarray(face_img)
    else:
        image_pil = Image.open(image_path).convert("RGB")

    image_tensor = transform(image_pil).unsqueeze(0).to(device)

    with torch.no_grad():
        output = model(image_tensor)
        probabilities = torch.softmax(output, dim=1)
        score = probabilities[0][0].item()  

    label = "Fake" if score > 0.5 else "Real"
    return label, round(score, 4)
