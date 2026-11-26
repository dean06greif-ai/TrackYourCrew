import pytest

from core import _mongo_url


def test_mongo_url_neuer_name():
    assert _mongo_url({"MONGO_URL": "mongodb://a"}) == "mongodb://a"


def test_mongo_url_alter_name_geht_weiter():
    assert _mongo_url({"MONGO_URI": "mongodb://b"}) == "mongodb://b"


def test_mongo_url_neuer_name_gewinnt():
    assert _mongo_url({"MONGO_URL": "mongodb://a", "MONGO_URI": "mongodb://b"}) == "mongodb://a"


def test_mongo_url_fehlt():
    with pytest.raises(KeyError):
        _mongo_url({})
