with open("app/api/v1/fees.py", "r", encoding="utf-8") as f:
    content = f.read()

# Find generate invoice endpoint
idx = content.find("def generate_invoice(")
snippet = content[idx:idx+60]
print("Found:", snippet)