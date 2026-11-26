"""Profilbilder (Plan 9): Board schickt einen Link statt Base64, eigener Endpunkt."""
import base64

from conftest import befriend, run

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\nfake-image-bytes").decode()
DATA_URL = f"data:image/png;base64,{PNG}"


def test_board_and_friends_get_link_not_base64(auth, user, make_user, db):
    bob = make_user("Bob", handle="BOB22")
    run(db.users.update_one({"user_id": bob["user_id"]}, {"$set": {"picture": DATA_URL}}))
    befriend(db, user, bob)
    entry = auth.get("/api/board").json()["users"][1]
    assert entry["picture"].startswith(f"/api/users/{bob['user_id']}/avatar?v=")
    assert "base64" not in entry["picture"]
    friend = auth.get("/api/friends").json()["friends"][0]
    assert friend["picture"] == entry["picture"]


def test_avatar_endpoint_serves_image_with_long_cache(client, make_user, db):
    bob = make_user("Bob", handle="BOB22")
    run(db.users.update_one({"user_id": bob["user_id"]}, {"$set": {"picture": DATA_URL}}))
    client.headers.update(bob["headers"])
    link = client.get("/api/board").json()["users"][0]["picture"]
    client.headers.pop("Authorization")
    r = client.get(link)  # ohne Login: Bilder laden per <img>, ohne Token
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content == b"\x89PNG\r\n\x1a\nfake-image-bytes"
    assert "immutable" in r.headers["cache-control"]


def test_wrong_version_or_no_image_is_404(client, make_user, db):
    bob = make_user("Bob", handle="BOB22")
    assert client.get(f"/api/users/{bob['user_id']}/avatar?v=abc").status_code == 404
    run(db.users.update_one({"user_id": bob["user_id"]}, {"$set": {"picture": DATA_URL}}))
    assert client.get(f"/api/users/{bob['user_id']}/avatar?v=0000000000000000").status_code == 404
    assert client.get(f"/api/users/{bob['user_id']}/avatar").status_code == 404


def test_google_picture_links_pass_through(auth, user, db):
    run(db.users.update_one({"user_id": user["user_id"]}, {"$set": {"picture": "https://lh3.example/p.jpg"}}))
    assert auth.get("/api/board").json()["users"][0]["picture"] == "https://lh3.example/p.jpg"


def test_new_picture_changes_link(auth, user, db):
    run(db.users.update_one({"user_id": user["user_id"]}, {"$set": {"picture": DATA_URL}}))
    a = auth.get("/api/board").json()["users"][0]["picture"]
    run(db.users.update_one({"user_id": user["user_id"]}, {"$set": {"picture": DATA_URL + "AA"}}))
    b = auth.get("/api/board").json()["users"][0]["picture"]
    assert a != b
