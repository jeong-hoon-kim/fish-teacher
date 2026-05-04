import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import io
from PIL import Image

app = FastAPI()

# 프런트엔드(Vite)와의 통신을 위한 CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. 모델 로드 (best.pt 파일이 같은 폴더에 있어야 함)
try:
    model = YOLO("best.pt")
    print("✅ YOLO 모델(best.pt) 로드 완료")
except Exception as e:
    print(f"❌ 모델 로드 실패 (best.pt 파일을 확인해주세요): {e}")
    model = None

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if model is None:
        return {"species": "모델 로드 실패 (best.pt 확인)"}
    
    # 2. 이미지 읽기
    contents = await file.read()
    image = Image.open(io.BytesIO(contents))
    
    # 3. YOLO 추론
    results = model(image)
    
    # 4. 가장 확률이 높은 결과 반환
    if len(results) > 0 and len(results[0].boxes) > 0:
        # 학습시킨 모델의 클래스 이름 중 첫 번째 탐지된 결과
        names = results[0].names
        class_id = int(results[0].boxes[0].cls)
        detected_species = names[class_id]
        return {"species": detected_species}
    
    return {"species": "알 수 없는 어종"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
