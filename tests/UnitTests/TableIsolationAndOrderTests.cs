// ============================================================================
// MESA VIVA — xUNIT AUTOMATED UNIT & INTEGRATION TESTS (.NET 8)
// Testes de Isolamento de Mesas, Concorrência, Idempotência e Fechamento de Conta
// ============================================================================

using System;
using Xunit;
using MesaViva.Domain.Entities;

namespace MesaViva.Tests.UnitTests;

public sealed class TableIsolationAndOrderTests
{
    [Fact]
    public void OpenSession_WhenTableAlreadyOccupied_ThrowsConcurrencyException()
    {
        var table = new RestaurantTable();
        table.OpenSession(101);

        Assert.Throws<InvalidOperationException>(() => table.OpenSession(102));
    }

    [Fact]
    public void ClientSession_WhenAccessingDifferentTableId_BlocksCrossTableAccess()
    {
        var session = new TableSession();
        var now = DateTimeOffset.UtcNow;

        Assert.Throws<UnauthorizedAccessException>(() =>
            session.EnsureAuthorizedForTable(requestedTableId: 999, now: now));
    }

    [Fact]
    public void OrderItem_WhenCancelledWithoutAuditReason_ThrowsException()
    {
        var item = new OrderItemSnapshot
        {
            Id = 1,
            ProductId = 10,
            ProductNameSnapshot = "Picanha Angus na Brasa",
            UnitPriceCentsSnapshot = 10990,
            Quantity = 1
        };

        Assert.Throws<ArgumentException>(() =>
            item.TransitionStatus(OrderStatus.Cancelled, actorRole: "ADMIN", reason: ""));
    }
}
