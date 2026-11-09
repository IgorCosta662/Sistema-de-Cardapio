// ============================================================================
// MESA VIVA — C# / .NET 8 DOMAIN LAYER (Clean Architecture)
// Entidades de Domínio, Regras de Invariância, Isolamento de Sessão e Sincronização
// ============================================================================

using System;
using System.Collections.Generic;
using System.Linq;

namespace MesaViva.Domain.Entities;

public enum TableStatus
{
    Available,
    Occupied,
    WaitingService,
    WaitingPayment,
    Closing,
    Maintenance
}

public enum SessionStatus
{
    Active,
    Closing,
    Closed,
    Revoked
}

public enum OrderStatus
{
    Received,
    Confirmed,
    Preparing,
    Ready,
    Delivered,
    Cancelled
}

public enum AuthorityDomain
{
    LocalOperational,
    CloudCatalog
}

public sealed class RestaurantTable
{
    public int Id { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public int Number { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public int Capacity { get; private set; }
    public string Sector { get; private set; } = "Salão Principal";
    public TableStatus Status { get; private set; } = TableStatus.Available;
    public int? ActiveSessionId { get; private set; }
    public int EstablishmentId { get; private set; }

    public void OpenSession(int sessionId)
    {
        if (Status == TableStatus.Maintenance)
            throw new InvalidOperationException("Mesa indisponível para manutenção.");
        if (Status != TableStatus.Available || ActiveSessionId.HasValue)
            throw new InvalidOperationException("Operação concorrente bloqueada: Mesa já possui sessão ativa.");

        Status = TableStatus.Occupied;
        ActiveSessionId = sessionId;
    }

    public void ReleaseTable()
    {
        Status = TableStatus.Available;
        ActiveSessionId = null;
    }
}

public sealed class TableSession
{
    public int Id { get; private set; }
    public Guid GlobalId { get; private set; } = Guid.NewGuid();
    public int TableId { get; private set; }
    public int EstablishmentId { get; private set; }
    public SessionStatus Status { get; private set; } = SessionStatus.Active;
    public string AccessCode { get; private set; } = string.Empty;
    public string AccessPasswordHash { get; private set; } = string.Empty;
    public string QrToken { get; private set; } = string.Empty;
    public int FailedAttempts { get; private set; }
    public DateTimeOffset? LockedUntil { get; private set; }
    public DateTimeOffset ExpiresAt { get; private set; }
    public DateTimeOffset? RevokedAt { get; private set; }

    public void EnsureAuthorizedForTable(int requestedTableId, DateTimeOffset now)
    {
        if (Status != SessionStatus.Active || RevokedAt.HasValue)
            throw new UnauthorizedAccessException("Sessão encerrada ou credenciais revogadas.");
        if (now > ExpiresAt)
            throw new UnauthorizedAccessException("Credenciais temporárias expiradas.");
        if (LockedUntil.HasValue && now < LockedUntil.Value)
            throw new UnauthorizedAccessException("Sessão temporariamente bloqueada por tentativas excessivas.");
        if (TableId != requestedTableId)
            throw new UnauthorizedAccessException("Violação de isolamento entre mesas bloqueada pelo servidor.");
    }

    public void RevokeOnClose(DateTimeOffset now)
    {
        Status = SessionStatus.Closed;
        RevokedAt = now;
    }
}

public sealed class OrderItemSnapshot
{
    public int Id { get; init; }
    public int ProductId { get; init; }
    public string StationCode { get; init; } = "COZINHA";
    public string ProductNameSnapshot { get; init; } = string.Empty;
    public int UnitPriceCentsSnapshot { get; init; }
    public int AddonsUnitCentsSnapshot { get; init; }
    public int Quantity { get; init; }
    public int LineTotalCents => (UnitPriceCentsSnapshot + AddonsUnitCentsSnapshot) * Quantity;
    public OrderStatus Status { get; private set; } = OrderStatus.Confirmed;

    public void TransitionStatus(OrderStatus nextStatus, string actorRole, string? reason)
    {
        if (nextStatus == OrderStatus.Cancelled)
        {
            if (actorRole != "ADMIN" && actorRole != "WAITER" && actorRole != "SUPER_ADMIN")
                throw new UnauthorizedAccessException("Apenas gerência ou garçom autorizado podem cancelar itens.");
            if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length < 4)
                throw new ArgumentException("Cancelamento exige justificativa auditável.");
        }
        Status = nextStatus;
    }
}
