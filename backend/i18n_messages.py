"""Übersetzungen für Server-Meldungen und Standard-Übungen.

Fehlermeldungen werden im Code auf Deutsch geschrieben und beim Senden anhand des
Headers `Accept-Language` übersetzt (siehe Exception-Handler in server.py).
Neue Meldung: hier eintragen, sonst kommt sie unverändert (Deutsch) an.
"""

SUPPORTED = ("en", "de", "es", "fr")

# Standard-Übungen je Sprache (Schlüssel ex1..ex3 bleiben gleich).
DEFAULT_NAMES = {
    "en": {"ex1": "Running", "ex2": "Push-ups", "ex3": "Pull-ups"},
    "de": {"ex1": "Lauf", "ex2": "Liegestütze", "ex3": "Klimmzüge"},
    "es": {"ex1": "Correr", "ex2": "Flexiones", "ex3": "Dominadas"},
    "fr": {"ex1": "Course", "ex2": "Pompes", "ex3": "Tractions"},
}

MESSAGES = {
    "Wen willst du herausfordern?": {"en": "Who do you want to challenge?", "es": "¿A quién quieres retar?", "fr": "Qui veux-tu défier ?"},
    "Höchstens 5 Leute pro Herausforderung": {"en": "At most 5 people per challenge", "es": "Máximo 5 personas por reto", "fr": "5 personnes maximum par défi"},
    "Kurz warten": {"en": "Wait a moment", "es": "Espera un momento", "fr": "Attends un instant"},
    "Auf einem anderen Gerät wurde inzwischen gespeichert": {
        "en": "Something was saved on another device in the meantime",
        "es": "Mientras tanto se guardó algo en otro dispositivo",
        "fr": "Entre-temps, quelque chose a été enregistré sur un autre appareil"},
    "Dir fehlen diese Woche noch: {rest}": {
        "en": "Still to go this week: {rest}", "es": "Te falta esta semana: {rest}",
        "fr": "Il te reste cette semaine : {rest}"},
    "So sehen deine Erinnerungen aus.": {
        "en": "This is what your reminders look like.", "es": "Así se verán tus recordatorios.",
        "fr": "Voici à quoi ressembleront tes rappels."},
    "Push ist auf diesem Server nicht eingerichtet": {
        "en": "Push isn't set up on this server", "es": "Las notificaciones no están configuradas en este servidor",
        "fr": "Les notifications ne sont pas configurées sur ce serveur"},
    "Bitte deinen Code zur Bestätigung eingeben": {
        "en": "Please enter your code to confirm", "es": "Introduce tu código para confirmar",
        "fr": "Saisis ton code pour confirmer"},
    "Dich selbst kannst du nicht herausfordern": {
        "en": "You can't challenge yourself", "es": "No puedes retarte a ti mismo", "fr": "Tu ne peux pas te défier toi-même"},
    "Bitte ein gemeinsames Ziel angeben": {
        "en": "Please enter a shared goal", "es": "Indica un objetivo común", "fr": "Indique un objectif commun"},
    "Diese Woche läuft schon eine Herausforderung mit dieser Person": {
        "en": "There's already a challenge with this person this week",
        "es": "Ya hay un reto con esta persona esta semana", "fr": "Il y a déjà un défi avec cette personne cette semaine"},
    "Herausforderung nicht gefunden": {
        "en": "Challenge not found", "es": "Reto no encontrado", "fr": "Défi introuvable"},
    "Diese Herausforderung kann nicht mehr angenommen werden": {
        "en": "This challenge can no longer be accepted", "es": "Este reto ya no se puede aceptar",
        "fr": "Ce défi ne peut plus être accepté"},
    "Diese Herausforderung kann nicht mehr zurückgezogen werden": {
        "en": "This challenge can no longer be withdrawn", "es": "Este reto ya no se puede retirar",
        "fr": "Ce défi ne peut plus être retiré"},
    "Die Einheiten passen nicht zusammen": {
        "en": "The units don't match", "es": "Las unidades no coinciden", "fr": "Les unités ne correspondent pas"},
    "Auf dich selbst kannst du nicht reagieren": {
        "en": "You can't react to yourself", "es": "No puedes reaccionar a ti mismo",
        "fr": "Tu ne peux pas réagir à toi-même"},
    "Nicht in deiner Crew": {
        "en": "Not in your crew", "es": "No está en tu crew", "fr": "Pas dans ta crew"},
    "Bereits in deiner Crew": {
        "en": "Already in your crew", "es": "Ya está en tu crew", "fr": "Déjà dans ta crew"},
    "Bild zu groß (max ~500KB)": {
        "en": "Image too large (max ~500 KB)", "es": "Imagen demasiado grande (máx. ~500 KB)",
        "fr": "Image trop grande (max ~500 Ko)"},
    "Dein Programm startet erst am Montag": {
        "en": "Your program starts on Monday", "es": "Tu programa empieza el lunes",
        "fr": "Ton programme commence lundi"},
    "Dich selbst kannst du nicht hinzufügen": {
        "en": "You can't add yourself", "es": "No puedes añadirte a ti mismo",
        "fr": "Tu ne peux pas t'ajouter toi-même"},
    "Diese Woche kann nicht bearbeitet werden": {
        "en": "This week can't be edited", "es": "Esta semana no se puede editar",
        "fr": "Cette semaine ne peut pas être modifiée"},
    "Du hast diese Woche bereits geboostet": {
        "en": "You already boosted this week", "es": "Ya usaste el boost esta semana",
        "fr": "Tu as déjà utilisé le boost cette semaine"},
    "Hashtag muss 5 Zeichen lang sein": {
        "en": "The code must be 5 characters", "es": "El código debe tener 5 caracteres",
        "fr": "Le code doit comporter 5 caractères"},
    "Kein User mit diesem Hashtag": {
        "en": "No user with this code", "es": "Ningún usuario con este código",
        "fr": "Aucun utilisateur avec ce code"},
    "Kein aktiver Boost diese Woche": {
        "en": "No active boost this week", "es": "No hay boost activo esta semana",
        "fr": "Aucun boost actif cette semaine"},
    "Mindestens eine Übung muss aktiv bleiben": {
        "en": "At least one exercise must stay active", "es": "Al menos un ejercicio debe seguir activo",
        "fr": "Au moins un exercice doit rester actif"},
    "Mindestens eine Übung muss aktiv sein": {
        "en": "At least one exercise must be active", "es": "Al menos un ejercicio debe estar activo",
        "fr": "Au moins un exercice doit être actif"},
    "Nachricht muss 3 bis 2000 Zeichen lang sein": {
        "en": "Message must be 3 to 2000 characters", "es": "El mensaje debe tener entre 3 y 2000 caracteres",
        "fr": "Le message doit comporter entre 3 et 2000 caractères"},
    "Name passt nicht zum Hashtag": {
        "en": "Name doesn't match the code", "es": "El nombre no coincide con el código",
        "fr": "Le nom ne correspond pas au code"},
    "Name und Hashtag erforderlich": {
        "en": "Name and code required", "es": "Nombre y código obligatorios",
        "fr": "Nom et code requis"},
    "Aktivitäten können nicht geboostet werden": {
        "en": "Activities can't be boosted", "es": "Las actividades no se pueden potenciar",
        "fr": "Les activités ne peuvent pas être boostées"},
    "Aktivitäten haben keine Varianten": {
        "en": "Activities have no variants", "es": "Las actividades no tienen variantes",
        "fr": "Les activités n'ont pas de variantes"},
    "Maximal 7 Aktivitäten gleichzeitig": {
        "en": "At most 7 activities at a time", "es": "Máximo 7 actividades a la vez",
        "fr": "7 activités maximum à la fois"},
    "Pausierte Übungen können nicht geboostet werden": {
        "en": "Paused exercises can't be boosted", "es": "Los ejercicios en pausa no se pueden potenciar",
        "fr": "Les exercices en pause ne peuvent pas être boostés"},
    "Abgeschlossene Übungen können nicht gewechselt werden": {
        "en": "Completed exercises can't be switched", "es": "Los ejercicios terminados no se pueden cambiar",
        "fr": "Les exercices terminés ne peuvent pas être changés"},
    "Variante fehlt oder ist unverändert": {
        "en": "Variant missing or unchanged", "es": "Falta la variante o no ha cambiado",
        "fr": "Variante manquante ou inchangée"},
    "effect_id fehlt": {"en": "effect_id missing", "es": "Falta effect_id", "fr": "effect_id manquant"},
    "Anfrage schon gesendet": {"en": "Request already sent", "es": "Solicitud ya enviada", "fr": "Demande déjà envoyée"},
    "Nimmt gerade keine Freundschaftsanfragen an": {
        "en": "Not accepting friend requests right now", "es": "Ahora no acepta solicitudes de amistad",
        "fr": "N'accepte pas de demandes d'ami pour le moment"},
    "Anfrage nicht gefunden": {"en": "Request not found", "es": "Solicitud no encontrada", "fr": "Demande introuvable"},
    "Falsches Konto": {"en": "Wrong account", "es": "Cuenta incorrecta", "fr": "Mauvais compte"},
    "Kein Bild": {"en": "No image", "es": "Sin imagen", "fr": "Pas d'image"},
    "Unbekannte Aktion": {"en": "Unknown action", "es": "Acción desconocida", "fr": "Action inconnue"},
    "Ungültiger Wert": {"en": "Invalid value", "es": "Valor no válido", "fr": "Valeur invalide"},
    "Ungültiger Wochentag": {"en": "Invalid weekday", "es": "Día no válido", "fr": "Jour invalide"},
    "Wert außerhalb des erlaubten Bereichs": {
        "en": "Value out of range", "es": "Valor fuera de rango", "fr": "Valeur hors limites"},
    "Zu viele Nachrichten, bitte später nochmal": {
        "en": "Too many messages, please try again later",
        "es": "Demasiados mensajes, inténtalo más tarde",
        "fr": "Trop de messages, réessaie plus tard"},
    "Übung nicht gefunden": {
        "en": "Exercise not found", "es": "Ejercicio no encontrado", "fr": "Exercice introuvable"},
    "Übungs-Keys müssen eindeutig sein": {
        "en": "Exercise keys must be unique", "es": "Las claves de ejercicio deben ser únicas",
        "fr": "Les clés d'exercice doivent être uniques"},
    "Maximal 7 Übungen gleichzeitig": {
        "en": "Maximum 7 exercises at a time", "es": "Máximo 7 ejercicios a la vez",
        "fr": "7 exercices maximum en même temps"},
}


def pick_language(accept_language: str) -> str:
    """Erste unterstützte Sprache aus einem Accept-Language-Header, sonst 'en'."""
    for part in (accept_language or "").split(","):
        code = part.split(";")[0].strip()[:2].lower()
        if code in SUPPORTED:
            return code
    return "en"


def normalize(code) -> str | None:
    c = str(code or "")[:2].lower()
    return c if c in SUPPORTED else None


def translate(message: str, lang: str) -> str:
    if lang == "de":
        return message
    return MESSAGES.get(message, {}).get(lang, message)
