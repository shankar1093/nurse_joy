import fitz  # PyMuPDF
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import time
import smtplib
from email.message import EmailMessage
import requests
from datetime import datetime
import os
import uvicorn

app = FastAPI()

class FormData(BaseModel):
    answers: List[str]
    recipient: str

def send_email(recipient: str, pdf_path: str):
    msg = EmailMessage()
    msg['Subject'] = 'Patient Information'
    msg['From'] = 'shankar@mjw.co.in'
    msg['To'] = recipient
    msg.set_content('Hello,\n\nPlease find the attached PDF document.\n\nBest regards,\nYour Name')

    with open(pdf_path, 'rb') as f:
        pdf_data = f.read()
        msg.add_attachment(
            pdf_data,
            maintype='application',
            subtype='pdf',
            filename=os.path.basename(pdf_path)
        )

    smtp_server = 'email-smtp.ap-south-1.amazonaws.com'
    smtp_port = 587  # Port for TLS
    smtp_username = os.environ.get("AWS_USERNAME")
    smtp_password = os.environ.get("AWS_PASSWORD")

    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_username, smtp_password)
            server.send_message(msg)
            print("Email sent successfully!")
    except Exception as e:
        print(f"Failed to send email: {e}")

def find_answer_fields(pdf_path):
    doc = fitz.open(pdf_path)
    answer_coordinates = []
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        text_instances = page.search_for("answer", flags=fitz.TEXT_DEHYPHENATE)
        for rect in text_instances:
            x0, y0, x1, y1 = rect
            insert_point = {
                'page': page_num,
                'coordinates': (x1 + 20, y0),
                'line_end': (page.rect.width - 20, y0)
            }
            answer_coordinates.append(insert_point)
    
    doc.close()
    return answer_coordinates

def fill_answers(pdf_path, output_path, answers):
    doc = fitz.open(pdf_path)
    field_positions = find_answer_fields(pdf_path)
    
    if len(answers) < len(field_positions):
        print(f"Warning: Only {len(answers)} answers provided for {len(field_positions)} fields")
    
    for answer, field in zip(answers, field_positions):
        page = doc[field['page']]
        x, y = field['coordinates']
        page.insert_text(
            point=(x, y),
            text=answer,
            fontname="helv",
            fontsize=11,
            color=(0, 0, 0)
        )
    
    doc.save(output_path)
    doc.close()

@app.post("/update_pdf/")
async def submit_form(data: FormData):
    answers = data.answers
    recipient = data.recipient
    # URL for the remote PDF on S3
    pdf_url = "https://nursejoy.s3.ap-south-1.amazonaws.com/form.pdf"
    
    # Download the PDF from S3
    response = requests.get(pdf_url)
    if response.status_code != 200:
        return {"error": "Failed to download PDF from S3."}
    
    # Save the downloaded PDF to a temporary file
    temp_pdf_path = "temp_form.pdf"
    with open(temp_pdf_path, "wb") as f:
        f.write(response.content)
    
    output_path = f"filled_pdfs/file_{int(time.time())}.pdf"
    
    # Ensure the output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Debug: print answer field positions
    positions = find_answer_fields(temp_pdf_path)
    print("Found answer fields at:")
    for pos in positions:
        print(f"Page {pos['page']}: {pos['coordinates']}")
    
    # Fill the answers into the PDF
    fill_answers(temp_pdf_path, output_path, answers)
    
    # Send emails with the filled PDF attached
    send_email(recipient, output_path)
    # send_email('anthony.upton@gmail.com', output_path)
    
    # Delete the temporary files
    try:
        if os.path.exists(output_path):
            os.remove(output_path)
            print(f"Deleted file: {output_path}")
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)
            print(f"Deleted file: {temp_pdf_path}")
    except Exception as e:
        print(f"Error deleting file: {e}")
    
    return {"message": "PDF updated, emails sent, and temporary files deleted."}

@app.get("/status/")
async def get_status():
    return {
        "status": "healthy",
        "message": "All systems are operational.",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "active_users": 0
    }

@app.get("/")
async def read_root():
    return {"message": "Hello World!"}

@app.get("/send_test_email/")
async def send_test_email():
    msg = EmailMessage()
    msg['Subject'] = 'Test Email'
    msg['From'] = 'shankar@mjw.co.in'
    msg['To'] = "shankar1093@gmail.com"
    msg.set_content('Hello,\n\nThis is a test email.\n\nBest regards,\nYour Name')

    smtp_server = 'email-smtp.ap-south-1.amazonaws.com'
    smtp_port = 587  # Port for TLS
    smtp_username = os.environ.get("AWS_USERNAME")
    smtp_password = os.environ.get("AWS_PASSWORD")

    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_username, smtp_password)
            server.send_message(msg)
            print("Test email sent successfully!")
    except Exception as e:
        print(f"Failed to send test email: {e}")

    return {"message": "Test email sent."}

@app.get("/test/")
async def test_endpoint():
    return {"message": "Hello"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 4000))
    uvicorn.run(app, host="0.0.0.0", port=port)