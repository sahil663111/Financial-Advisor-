import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

from app.main import app
from app.database import get_db
from app.auth.dependencies import get_current_user

# Create a mock database client
mock_client = AsyncMongoMockClient()
mock_db = mock_client["test_db"]

# Override FastAPI dependencies
app.dependency_overrides[get_db] = lambda: mock_db
app.dependency_overrides[get_current_user] = lambda: {"_id": "user_1", "email": "test@companya.com"}

client = TestClient(app)

@pytest.fixture(autouse=True)
async def setup_db():
    """Setup mock database with two orgs and assign user_1 to org_A only."""
    # Clear collections
    await mock_db.organizations.delete_many({})
    await mock_db.org_members.delete_many({})
    await mock_db.expenses.delete_many({})

    from bson import ObjectId
    
    # Pre-defined ObjectId strings for orgs
    org_a_id = str(ObjectId())
    org_b_id = str(ObjectId())
    
    # Create Orgs
    await mock_db.organizations.insert_many([
        {"_id": ObjectId(org_a_id), "name": "Company A", "is_active": True},
        {"_id": ObjectId(org_b_id), "name": "Company B", "is_active": True}
    ])

    # Assign user_1 ONLY to Company A
    await mock_db.org_members.insert_one({
        "org_id": org_a_id,
        "user_id": "user_1",
        "role": "ADMIN"
    })
    
    # Insert some mock expenses
    await mock_db.expenses.insert_many([
        {"org_id": org_a_id, "amount": 100, "category": "OFFICE_SUPPLIES"},
        {"org_id": org_b_id, "amount": 5000, "category": "SOFTWARE"}
    ])
    
    # Pass IDs to test functions
    return {"org_a_id": org_a_id, "org_b_id": org_b_id}


@pytest.mark.asyncio
async def test_tenant_isolation_success(setup_db):
    """Test that Company A user CAN access Company A's data."""
    org_a_id = setup_db["org_a_id"]
    
    response = client.get(f"/api/v1/business/organizations/{org_a_id}/expenses")
    
    # Should succeed because user_1 is in org_A
    assert response.status_code == 200
    data = response.json()
    assert "data" in data

@pytest.mark.asyncio
async def test_tenant_isolation_forbidden(setup_db):
    """Test that Company A user CANNOT access Company B's data."""
    org_b_id = setup_db["org_b_id"]
    
    response = client.get(f"/api/v1/business/organizations/{org_b_id}/expenses")
    
    # Should be forbidden because user_1 is NOT in org_B
    assert response.status_code == 403
