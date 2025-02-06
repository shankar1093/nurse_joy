import fitz  # PyMuPDF
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import time
import smtplib
from email.message import EmailMessage
import requests

app = FastAPI()

class FormData(BaseModel):
    answers:List[str]


def send_email(recipient: str, pdf_path: str):
    msg = EmailMessage()
    msg['Subject'] = 'Patient Information'
    msg['From'] = 'postmaster@sandboxb09071bdece741eb86ee49fa290b7f3d.mailgun.org'
    msg['To'] = recipient
    msg.set_content('Hello,\n\nPlease find the attached PDF document.\n\nBest regards,\nYour Name')

    pdf_filename = pdf_path

    with open(pdf_filename, 'rb') as f:
        pdf_data = f.read()
        # Attach the PDF with appropriate MIME types
        msg.add_attachment(pdf_data,
                           maintype='application',
                           subtype='pdf',
                           filename=pdf_filename.split('/')[-1])  # Use just the filename

    smtp_server = 'smtp.mailgun.org'
    smtp_port = 587  # Port for TLS
    username = 'postmaster@sandboxb09071bdece741eb86ee49fa290b7f3d.mailgun.org'
    password = '869bc7fc666fb91d8ce2fe9f34347788-667818f5-80cece61'

    # Send the email
    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()  # Upgrade the connection to a secure encrypted SSL/TLS connection
            server.login(username, password)  # Log in to the SMTP server
            server.send_message(msg)  # Send the email
            print("Email sent successfully!")
    except Exception as e:
        print(f"Failed to send email: {e}")

def find_answer_fields(pdf_path):
    doc = fitz.open(pdf_path)
    answer_coordinates = []
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        
        # Search for the word "answer" (case insensitive)
        # Using only TEXT_DEHYPHENATE flag
        text_instances = page.search_for("answer", flags=fitz.TEXT_DEHYPHENATE)
        
        for rect in text_instances:
            # Get coordinates of the marker word "answer"
            x0, y0, x1, y1 = rect
            
            # Calculate insertion point (20 points to the right of "answer")
            # Keeping the same y-coordinate for alignment
            insert_point = {
                'page': page_num,
                'coordinates': (x1 + 20, y0),  # 20 points right of the word
                'line_end': (page.rect.width - 20, y0)  # End of line (with margin)
            }
            
            answer_coordinates.append(insert_point)
    
    doc.close()
    return answer_coordinates

def fill_answers(pdf_path, output_path, answers):
    doc = fitz.open(pdf_path)
    
    # Get coordinates for all answer fields
    field_positions = find_answer_fields(pdf_path)
    
    # Make sure we have enough answers for all fields
    if len(answers) < len(field_positions):
        print(f"Warning: Only {len(answers)} answers provided for {len(field_positions)} fields")
    
    # Insert each answer
    for answer, field in zip(answers, field_positions):
        page = doc[field['page']]
        
        # Calculate text placement
        x, y = field['coordinates']
        
        # Insert the text
        page.insert_text(
            point=(x, y),
            text=answer,
            fontname="helv",
            fontsize=11,
            color=(0, 0, 0)
        )
    
    # Save the modified PDF
    doc.save(output_path)
    doc.close()

@app.post("/update_pdf/")
async def submit_form(data:FormData):
    answers = data.answers
    pdf_path = 'forms/form.pdf'
    output_path = f"filled_pdfs/file_{int(time.time())}.pdf"
    positions = find_answer_fields(pdf_path)
    print("Found answer fields at:")
    for pos in positions:
        print(f"Page {pos['page']}: {pos['coordinates']}")
    
    # Fill the answers
    fill_answers(pdf_path, output_path, answers)
    send_email('shankar1093@gmail.com', output_path)
