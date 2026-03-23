from app.main import app
import os

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5005))
    app.run(host='0.0.0.0', port=port, debug=True)
